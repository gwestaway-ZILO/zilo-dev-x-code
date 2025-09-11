/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ToolCallRequestInfo } from '@google/gemini-cli-core';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  parseAndFormatApiError,
  FatalInputError,
  FatalTurnLimitedError,
  promptIdContext,
} from '@google/gemini-cli-core';
import type { Content, Part } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';


export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  
  // Create a proxy config with skipNextSpeakerCheck enabled to prevent recursive continuation calls
  // that cause output duplication in non-interactive mode
  const nonInteractiveConfig = new Proxy(config, {
    get(target, prop) {
      if (prop === 'getSkipNextSpeakerCheck') {
        return () => true;
      }
      return target[prop as keyof Config];
    }
  }) as Config;
  
  return promptIdContext.run(prompt_id, async () => {
    const consolePatcher = new ConsolePatcher({
      stderr: true,
      debugMode: nonInteractiveConfig.getDebugMode(),
    });

    try {
      // Only patch console for non-interactive mode if debug mode is enabled
      // This prevents duplication of stdout writes while preserving error handling
      if (nonInteractiveConfig.getDebugMode()) {
        consolePatcher.patch();
      }
      // Handle EPIPE errors when the output is piped to a command that closes early.
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Exit gracefully if the pipe is closed.
          process.exit(0);
        }
      });

      const geminiClient = nonInteractiveConfig.getGeminiClient();

      const abortController = new AbortController();

      const { processedQuery, shouldProceed } = await handleAtCommand({
        query: input,
        config: nonInteractiveConfig,
        addItem: (_item, _timestamp) => 0,
        onDebugMessage: () => {},
        messageId: Date.now(),
        signal: abortController.signal,
      });

      if (!shouldProceed || !processedQuery) {
        // An error occurred during @include processing (e.g., file not found).
        // The error message is already logged by handleAtCommand.
        throw new FatalInputError(
          'Exiting due to an error processing the @ command.',
        );
      }

      let currentMessages: Content[] = [
        { role: 'user', parts: processedQuery as Part[] },
      ];

      let turnCount = 0;
      while (true) {
        turnCount++;
        if (
          nonInteractiveConfig.getMaxSessionTurns() >= 0 &&
          turnCount > nonInteractiveConfig.getMaxSessionTurns()
        ) {
          throw new FatalTurnLimitedError(
            'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
          );
        }
        const toolCallRequests: ToolCallRequestInfo[] = [];
        
        // Track cumulative content to prevent duplication
        let cumulativeContent = '';
        const seenContent = new Set<string>();

        const responseStream = geminiClient.sendMessageStream(
          currentMessages[0]?.parts || [],
          abortController.signal,
          prompt_id,
        );

        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            console.error('Operation cancelled.');
            return;
          }

          if (event.type === GeminiEventType.Content) {
            // Check if this is a complete duplicate of cumulative content (common streaming issue)
            if (event.value === cumulativeContent) {
              // Skip complete duplicate responses
              continue;
            } else if (!seenContent.has(event.value)) {
              seenContent.add(event.value);
              cumulativeContent += event.value;
              process.stdout.write(event.value);
            }
            // Skip individual duplicate chunks as well
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }
        }

        if (toolCallRequests.length > 0) {
          const toolResponseParts: Part[] = [];
          for (const requestInfo of toolCallRequests) {
            const toolResponse = await executeToolCall(
              nonInteractiveConfig,
              requestInfo,
              abortController.signal,
            );

            if (toolResponse.error) {
              console.error(
                `Error executing tool ${requestInfo.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
              );
            }

            if (toolResponse.responseParts) {
              toolResponseParts.push(...toolResponse.responseParts);
            }
          }
          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          process.stdout.write('\n'); // Ensure a final newline
          return;
        }
      }
    } catch (error) {
      console.error(
        parseAndFormatApiError(
          error,
          nonInteractiveConfig.getContentGeneratorConfig()?.authType,
        ),
      );
      throw error;
    } finally {
      if (nonInteractiveConfig.getDebugMode()) {
        consolePatcher.cleanup();
      }
      if (isTelemetrySdkInitialized()) {
        await shutdownTelemetry(nonInteractiveConfig);
      }
    }
  });
}
