/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CountTokensResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  PartListUnion,
  ContentListUnion,
  PartUnion,
} from '@google/genai';
import { FinishReason, GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { Stream } from '@anthropic-ai/sdk/streaming';

export class ClaudeContentGenerator implements ContentGenerator {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const contents = this.normalizeContents(request.contents);
    const messages = this.convertToClaudeMessages(contents);
    
    // Extract system message from contents OR from config
    let systemMessage = this.extractSystemMessage(contents);
    if (!systemMessage && request.config?.systemInstruction) {
      // Handle systemInstruction from config (this is where the system.md content comes from)
      if (typeof request.config.systemInstruction === 'string') {
        systemMessage = request.config.systemInstruction;
      } else if (typeof request.config.systemInstruction === 'object' && 'text' in request.config.systemInstruction) {
        systemMessage = (request.config.systemInstruction as any).text;
      }
    }
    
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: request.config?.maxOutputTokens || 8192,
      temperature: request.config?.temperature,
      system: systemMessage,
      messages,
    });

    return this.convertToGeminiResponse(response);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contents = this.normalizeContents(request.contents);
    const messages = this.convertToClaudeMessages(contents);
    
    // Extract system message from contents OR from config  
    let systemMessage = this.extractSystemMessage(contents);
    if (!systemMessage && request.config?.systemInstruction) {
      // Handle systemInstruction from config (this is where the system.md content comes from)
      if (typeof request.config.systemInstruction === 'string') {
        systemMessage = request.config.systemInstruction;
      } else if (typeof request.config.systemInstruction === 'object' && 'text' in request.config.systemInstruction) {
        systemMessage = (request.config.systemInstruction as any).text;
      }
    }
    
    const stream = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: request.config?.maxOutputTokens || 8192,
      temperature: request.config?.temperature,
      system: systemMessage,
      messages,
      stream: true,
    });

    return this.convertStreamToGeminiFormat(stream);
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Claude doesn't have a direct token counting API, so we'll estimate
    // This is a rough approximation - 1 token ≈ 4 characters
    const contents = this.normalizeContents(request.contents);
    const text = this.extractTextFromContents(contents);
    const estimatedTokens = Math.ceil(text.length / 4);
    
    return {
      totalTokens: estimatedTokens,
      cachedContentTokenCount: 0,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Claude doesn't support embeddings
    throw new Error('Embeddings are not supported with Claude models. Please use a Gemini model for embedding operations.');
  }

  private normalizeContents(contents: ContentListUnion): Content[] {
    // Handle the various forms of ContentListUnion
    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    }
    
    if (Array.isArray(contents)) {
      // Check if it's an array of Content objects
      if (contents.length === 0) {
        return [];
      }
      
      const firstItem = contents[0];
      if (typeof firstItem === 'object' && 'role' in firstItem) {
        return contents as Content[];
      }
      
      // It's an array of Parts or strings
      const parts: Part[] = contents.map(item => {
        if (typeof item === 'string') {
          return { text: item };
        }
        return item as Part;
      });
      return [{ role: 'user', parts }];
    }
    
    // Single Part or Content object
    if ('role' in contents) {
      return [contents as Content];
    }
    
    // Single Part
    const part = typeof contents === 'string' ? { text: contents } : contents as Part;
    return [{ role: 'user', parts: [part] }];
  }

  private convertToClaudeMessages(contents: Content[]): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];
    
    for (const content of contents) {
      if (content.role === 'system') continue; // System messages are handled separately
      
      const role = content.role === 'model' ? 'assistant' : 'user';
      const claudeContent = this.convertPartsToClaudeContent(content.parts);
      
      messages.push({
        role,
        content: claudeContent,
      });
    }
    
    return messages;
  }

  private extractSystemMessage(contents: Content[]): string | undefined {
    const systemContent = contents.find(c => c.role === 'system');
    if (!systemContent) return undefined;
    
    return this.extractTextFromParts(systemContent.parts);
  }

  private normalizePartListUnion(parts: PartListUnion | undefined): PartUnion[] {
    if (!parts) return [];
    
    if (Array.isArray(parts)) {
      return parts;
    }
    
    // Single PartUnion
    return [parts];
  }

  private convertPartsToClaudeContent(parts: PartListUnion | undefined): string | Anthropic.ContentBlock[] {
    const normalizedParts = this.normalizePartListUnion(parts);
    const claudeParts: Anthropic.ContentBlock[] = [];
    
    for (const part of normalizedParts) {
      if (typeof part === 'string') {
        claudeParts.push({ type: 'text', text: part } as Anthropic.TextBlock);
      } else if ('text' in part && part.text) {
        claudeParts.push({ type: 'text', text: part.text } as Anthropic.TextBlock);
      } else if ('inlineData' in part && part.inlineData) {
        // Image handling - Claude expects a different format
        // Skip images for now as Claude has specific requirements
        continue;
      } else if ('functionCall' in part && part.functionCall) {
        claudeParts.push({
          type: 'tool_use',
          id: `tool_${Date.now()}`,
          name: part.functionCall.name || 'unknown',
          input: part.functionCall.args || {},
        });
      }
    }
    
    return claudeParts.length === 1 && claudeParts[0].type === 'text' 
      ? claudeParts[0].text 
      : claudeParts;
  }

  private convertToGeminiResponse(response: Anthropic.Message): GenerateContentResponse {
    const parts: Part[] = [];
    
    for (const content of response.content) {
      if (content.type === 'text') {
        parts.push({ text: content.text });
      } else if (content.type === 'tool_use') {
        parts.push({
          functionCall: {
            name: content.name,
            args: content.input as any,
          },
        });
      }
    }
    
    const result = new GenerateContentResponse();
    result.candidates = [
      {
        content: {
          role: 'model',
          parts,
        },
        finishReason: response.stop_reason === 'max_tokens' ? FinishReason.MAX_TOKENS : FinishReason.STOP,
        index: 0,
      },
    ];
    result.usageMetadata = {
      promptTokenCount: response.usage.input_tokens,
      candidatesTokenCount: response.usage.output_tokens,
      totalTokenCount: response.usage.input_tokens + response.usage.output_tokens,
      cachedContentTokenCount: 0,
    };
    result.modelVersion = this.model;
    
    return result;
  }

  private async *convertStreamToGeminiFormat(
    stream: Stream<Anthropic.MessageStreamEvent>
  ): AsyncGenerator<GenerateContentResponse> {
    let accumulatedText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        accumulatedText += event.delta.text;
        
        const chunkResponse = new GenerateContentResponse();
        chunkResponse.candidates = [
          {
            content: {
              role: 'model',
              parts: [{ text: event.delta.text }],
            },
            finishReason: FinishReason.STOP,
            index: 0,
          },
        ];
        chunkResponse.modelVersion = this.model;
        yield chunkResponse;
      } else if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        // Handle tool use
        const toolResponse = new GenerateContentResponse();
        toolResponse.candidates = [
          {
            content: {
              role: 'model',
              parts: [{
                functionCall: {
                  name: event.content_block.name,
                  args: {},
                },
              }],
            },
            finishReason: FinishReason.STOP,
            index: 0,
          },
        ];
        toolResponse.modelVersion = this.model;
        yield toolResponse;
      }
    }
    
    // Final response with usage metadata
    if (inputTokens || outputTokens) {
      const finalResponse = new GenerateContentResponse();
      finalResponse.candidates = [
        {
          content: {
            role: 'model',
            parts: [],
          },
          finishReason: FinishReason.STOP,
          index: 0,
        },
      ];
      finalResponse.usageMetadata = {
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        totalTokenCount: inputTokens + outputTokens,
        cachedContentTokenCount: 0,
      };
      finalResponse.modelVersion = this.model;
      yield finalResponse;
    }
  }

  private extractTextFromContents(contents: Content[]): string {
    let text = '';
    for (const content of contents) {
      text += this.extractTextFromParts(content.parts) + ' ';
    }
    return text;
  }

  private extractTextFromParts(parts: PartListUnion | undefined): string {
    const normalizedParts = this.normalizePartListUnion(parts);
    let text = '';
    
    for (const part of normalizedParts) {
      if (typeof part === 'string') {
        text += part + ' ';
      } else if ('text' in part) {
        text += part.text + ' ';
      }
    }
    return text.trim();
  }
}