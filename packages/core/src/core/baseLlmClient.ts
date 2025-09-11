/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, GenerateContentConfig, Part } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Options for the generateJson utility function.
 */
export interface GenerateJsonOptions {
  /** The input prompt or history. */
  contents: Content[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /** The specific model to use for this task. */
  model: string;
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /**
   * Overrides for generation configuration (e.g., temperature).
   */
  config?: Omit<
    GenerateContentConfig,
    | 'systemInstruction'
    | 'responseJsonSchema'
    | 'responseMimeType'
    | 'tools'
    | 'abortSignal'
  >;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
}

/**
 * A client dedicated to stateless, utility-focused LLM calls.
 */
export class BaseLlmClient {
  // Default configuration for utility tasks
  private readonly defaultUtilityConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };

  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
  ) {}

  async generateJson(
    options: GenerateJsonOptions,
  ): Promise<Record<string, unknown>> {
    const {
      contents,
      schema,
      model,
      abortSignal,
      systemInstruction,
      promptId,
    } = options;

    // Detect if we're using Claude/Bedrock models
    // Check for various Claude model patterns
    const modelLower = model.toLowerCase();
    const isClaudeModel = modelLower.includes('claude') || 
                          modelLower.includes('anthropic') ||
                          modelLower.includes('sonnet') ||
                          modelLower.includes('opus') ||
                          modelLower.includes('haiku');
    const isBedrockModel = modelLower.includes('bedrock') || 
                           modelLower.includes('aws') ||
                           modelLower.includes('us.anthropic') ||
                           modelLower.includes('eu.anthropic') ||
                           modelLower.includes('ap.anthropic');
    const needsClaudeAdapter = isClaudeModel || isBedrockModel;

    let requestConfig: GenerateContentConfig;
    let modifiedContents = contents;

    if (needsClaudeAdapter) {
      // For Claude/Bedrock, we need to include the schema in the prompt itself
      // and not use responseJsonSchema which Claude doesn't support
      // Use compact JSON to reduce tokens
      const schemaString = JSON.stringify(schema);
      const claudeJsonInstruction = `<JSON_ONLY_MODE>
CRITICAL INSTRUCTION: You MUST respond with ONLY a valid JSON object. NO explanatory text, NO reasoning, NO conversation, NO markdown, NO code blocks.

REQUIRED SCHEMA: ${schemaString}

EXAMPLE VALID RESPONSES:
{"reasoning": "Brief explanation here", "next_speaker": "user"}
{"reasoning": "Another explanation", "next_speaker": "model"}

INVALID RESPONSES (DO NOT DO THIS):
- Looking at my response...
- Based on the analysis...  
- JSON code blocks
- Any text before or after the JSON

YOUR RESPONSE MUST:
1. Start with { and end with }
2. Be valid JSON parseable by JSON.parse()
3. Match the exact schema above
4. Contain NO other text whatsoever

RESPOND WITH JSON ONLY NOW:
</JSON_ONLY_MODE>`;

      // Prepend the JSON instruction to the last user message
      modifiedContents = [...contents];
      if (modifiedContents.length > 0) {
        const lastMessage = modifiedContents[modifiedContents.length - 1];
        if (lastMessage.role === 'user' && lastMessage.parts && lastMessage.parts.length > 0) {
          const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
          if (lastPart && 'text' in lastPart) {
            // Prepend the JSON instruction to the existing user message
            lastMessage.parts[lastMessage.parts.length - 1] = {
              text: claudeJsonInstruction + '\n\n' + lastPart.text
            };
          }
        } else {
          // Add as a new user message if the last message isn't from the user
          modifiedContents.push({
            role: 'user',
            parts: [{ text: claudeJsonInstruction }]
          });
        }
      }

      // Don't use responseJsonSchema for Claude
      requestConfig = {
        abortSignal,
        ...this.defaultUtilityConfig,
        ...options.config,
        ...(systemInstruction && { systemInstruction }),
        // Don't set these for Claude
        // responseJsonSchema: schema,
        // responseMimeType: 'application/json',
      };
    } else {
      // For Gemini models, use the original approach
      requestConfig = {
        abortSignal,
        ...this.defaultUtilityConfig,
        ...options.config,
        ...(systemInstruction && { systemInstruction }),
        responseJsonSchema: schema,
        responseMimeType: 'application/json',
      };
    }

    try {
      const apiCall = () =>
        this.contentGenerator.generateContent(
          {
            model,
            config: requestConfig,
            contents: modifiedContents,
          },
          promptId,
        );

      const result = await retryWithBackoff(apiCall);

      let text = getResponseText(result)?.trim();
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }

      text = this.cleanJsonResponse(text, model, needsClaudeAdapter);

      try {
        return JSON.parse(text);
      } catch (parseError) {
        const error = new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw error;
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      if (
        error instanceof Error &&
        (error.message === 'API returned an empty response for generateJson.' ||
          error.message.startsWith('Failed to parse API response as JSON:'))
      ) {
        // We perform this check so that we don't report these again.
      } else {
        await reportError(
          error,
          'Error generating JSON content via API.',
          contents,
          'generateJson-api',
        );
      }

      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  private cleanJsonResponse(text: string, model: string, isClaudeModel: boolean = false): string {
    // Handle markdown code blocks
    const prefix = '```json';
    const suffix = '```';
    if (text.startsWith(prefix) && text.endsWith(suffix)) {
      logMalformedJsonResponse(
        this.config,
        new MalformedJsonResponseEvent(model),
      );
      return text.substring(prefix.length, text.length - suffix.length).trim();
    }
    
    // For Claude models, be more aggressive about extracting JSON
    if (isClaudeModel) {
      // If Claude completely ignored JSON instruction and returned conversational text,
      // we need to handle this gracefully by creating a basic JSON response
      if (!text.trim().startsWith('{') && !text.includes('{')) {
        // This is pure conversational text, try to extract key information
        // For next_speaker cases, analyze the conversational content
        if (text.toLowerCase().includes('next') || text.toLowerCase().includes('speak') || 
            text.toLowerCase().includes('user') || text.toLowerCase().includes('model')) {
          
          // Try to determine the correct next speaker from the conversational response
          const userShouldSpeak = text.toLowerCase().includes('user should speak') ||
                                  text.toLowerCase().includes('waiting for user') ||
                                  text.toLowerCase().includes('decision: \'user\'') ||
                                  text.toLowerCase().includes('pause expecting user');
          
          const modelShouldSpeak = text.toLowerCase().includes('model should speak') ||
                                   text.toLowerCase().includes('model continues') ||
                                   text.toLowerCase().includes('decision: \'model\'');
          
          const nextSpeaker = modelShouldSpeak ? "model" : "user";
          const reasoning = userShouldSpeak ? "Analysis indicates user should respond" :
                           modelShouldSpeak ? "Analysis indicates model should continue" :
                           "Default: model response complete, awaiting user input";
          
          return JSON.stringify({
            reasoning,
            next_speaker: nextSpeaker
          });
        }
        // For other cases, we can't recover - let the original error bubble up
      }
      
      // First try to find JSON at the end of the response (Claude often adds explanation first)
      const lastJsonMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}(?!.*\{)/s);
      if (lastJsonMatch) {
        const extracted = lastJsonMatch[0];
        try {
          JSON.parse(extracted);
          if (extracted !== text) {
            logMalformedJsonResponse(
              this.config,
              new MalformedJsonResponseEvent(model),
            );
          }
          return extracted;
        } catch {
          // Try other extraction methods
        }
      }
      
      // Try to find any JSON object in the response
      const anyJsonMatch = text.match(/\{[\s\S]*?\}/g);
      if (anyJsonMatch) {
        // Try each JSON-like match
        for (const match of anyJsonMatch.reverse()) { // Start from the end
          try {
            JSON.parse(match);
            if (match !== text) {
              logMalformedJsonResponse(
                this.config,
                new MalformedJsonResponseEvent(model),
              );
            }
            return match;
          } catch {
            continue;
          }
        }
      }
    }
    
    // Try to extract JSON from partial responses
    // Look for JSON object patterns
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      const extracted = jsonObjectMatch[0];
      // Validate it's actually parseable
      try {
        JSON.parse(extracted);
        if (extracted !== text) {
          logMalformedJsonResponse(
            this.config,
            new MalformedJsonResponseEvent(model),
          );
        }
        return extracted;
      } catch {
        // If extraction failed, return original text
      }
    }
    
    // Look for JSON array patterns
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      const extracted = jsonArrayMatch[0];
      try {
        JSON.parse(extracted);
        if (extracted !== text) {
          logMalformedJsonResponse(
            this.config,
            new MalformedJsonResponseEvent(model),
          );
        }
        return extracted;
      } catch {
        // If extraction failed, return original text
      }
    }
    
    return text;
  }
}
