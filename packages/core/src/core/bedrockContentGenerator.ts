/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
  type InvokeModelCommandInput,
  type InvokeModelWithResponseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import {
  GenerateContentResponse,
  FinishReason,
  type CountTokensResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type EmbedContentResponse,
  type EmbedContentParameters,
  type FunctionCall,
  type GenerateContentResponseUsageMetadata,
  type ContentListUnion,
  type Content,
  type Part,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { getErrorMessage } from '../utils/errors.js';
import { PerformanceMonitor } from '../utils/performanceMonitor.js';
import { withRetry } from '../utils/retryLogic.js';
import { retryMessageService } from '../utils/retryMessageService.js';

// Bedrock inference profiles (these ARE the model IDs for cross-region inference)
// The inference profile includes the region prefix (us. or global.) for routing
const BEDROCK_MODEL_IDS: Record<string, string> = {
  // Claude 4 models (using inference profiles as model IDs)
  'claude-4-sonnet': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-sonnet-4-20250514': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  
  // Claude 3.5 models (using inference profiles)
  'claude-3-5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'claude-3-5-sonnet-20241022': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'claude-3-5-haiku': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  'claude-3-5-haiku-20241022': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  
  // Claude 3 models (using inference profiles)
  'claude-3-opus': 'us.anthropic.claude-3-opus-20240229-v1:0',
  'claude-3-opus-20240229': 'us.anthropic.claude-3-opus-20240229-v1:0',
  'claude-3-sonnet': 'us.anthropic.claude-3-sonnet-20240229-v1:0',
  'claude-3-sonnet-20240229': 'us.anthropic.claude-3-sonnet-20240229-v1:0',
  'claude-3-haiku': 'us.anthropic.claude-3-haiku-20240307-v1:0',
  'claude-3-haiku-20240307': 'us.anthropic.claude-3-haiku-20240307-v1:0',
  
  // Default fallback
  'default': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
};

interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
}

interface BedrockRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: BedrockMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

interface BedrockResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface BedrockStreamChunk {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    input?: string;
    stop_reason?: string | null;
  };
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  };
  message?: {
    id: string;
    type: string;
    role: string;
    model: string;
    content: Array<{ type: string; text?: string }>;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export class BedrockContentGenerator implements ContentGenerator {
  private client: BedrockRuntimeClient;
  private bedrockModelId: string;
  private region: string;
  private static loggedProfiles = new Set<string>();
  private static clientPool = new Map<string, BedrockRuntimeClient>();
  private static toolSchemaCache = new Map<string, any[]>();
  private debugMode: boolean;
  private performanceMonitor: PerformanceMonitor;
  private onRetryCallback?: (attempt: number, maxAttempts: number, delaySeconds: number, errorType: string) => void;

  constructor(
    model: string, 
    region?: string, 
    debugMode = false, 
    onRetry?: (attempt: number, maxAttempts: number, delaySeconds: number, errorType: string) => void
  ) {
    console.log(`[BEDROCK-GEN] 🚨 CONSTRUCTOR CALLED - Model: ${model}, Region: ${region}, DebugMode: ${debugMode}`);
    
    // Configure timeout from environment variable (default 120s, max 600s like Claude Code)
    const timeoutMs = Math.min(
      parseInt(process.env['API_TIMEOUT_MS'] || '120000', 10),
      600000 // 10 minute max
    );
    this.debugMode = debugMode;
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.performanceMonitor.setDebugMode(debugMode);
    this.onRetryCallback = onRetry || this.createRetryCallback();
    
    // Use provided region or environment variable, default to us-west-2
    this.region = region || process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-west-2';
    
    if (this.debugMode) {
      console.log(`[BEDROCK-GEN] BedrockContentGenerator constructor - Model: ${model}, Region: ${this.region}`);
    }
    
    // Map the model name to the correct inference profile
    if (model.includes('.anthropic.')) {
      this.bedrockModelId = model;
    } else {
      this.bedrockModelId = BEDROCK_MODEL_IDS[model] || BEDROCK_MODEL_IDS['default'];
    }
    
    // Only log each profile once to prevent duplicate messages
    if (!BedrockContentGenerator.loggedProfiles.has(this.bedrockModelId)) {
      console.log(`Using Bedrock inference profile: ${this.bedrockModelId} in region ${this.region}`);
      BedrockContentGenerator.loggedProfiles.add(this.bedrockModelId);
    }
    
    // Use connection pooling for AWS SDK clients
    const clientKey = `${model}-${this.region}`;
    if (!BedrockContentGenerator.clientPool.has(clientKey)) {
      BedrockContentGenerator.clientPool.set(clientKey, new BedrockRuntimeClient({
        region: this.region,
        maxAttempts: 1, // Let our retry logic handle retries
        requestHandler: {
          connectionTimeout: Math.min(timeoutMs / 4, 30000), // Connection timeout = 1/4 of total timeout
          socketTimeout: timeoutMs, // Use configurable timeout
        },
      }));
      
      if (debugMode) {
        console.log(`[BEDROCK-GEN] ⏱️  Configured timeouts: connection=${Math.min(timeoutMs / 4, 30000)}ms, socket=${timeoutMs}ms`);
      }
    }
    this.client = BedrockContentGenerator.clientPool.get(clientKey)!;
    
    if (this.debugMode) {
      console.log(`[BEDROCK-GEN] BedrockContentGenerator initialized with enhanced retry logic`);
    }
  }

  private createRetryCallback() {
    return (attempt: number, maxAttempts: number, delaySeconds: number, errorType: string) => {
      // Emit to UI via the retry message service
      retryMessageService.emitRetryMessage({
        attempt,
        maxAttempts,
        delaySeconds,
        errorType,
      });
    };
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    console.log(`[BEDROCK-GEN] 🔥 GENERATE CONTENT CALLED - UserPromptId: ${userPromptId}, DebugMode: ${this.debugMode}`);
    return this.performanceMonitor.timeAsync(
      'bedrock-generate-content',
      async () => {
        if (this.debugMode) {
          console.log(`[BEDROCK-GEN] generateContent called - UserPromptId: ${userPromptId}`);
        }
        
        return withRetry(async () => {
          if (this.debugMode) {
            console.log(`[BEDROCK-GEN] Making API call to ${this.bedrockModelId} in ${this.region}...`);
          }
          const bedrockRequest = await this.performanceMonitor.timeAsync(
            'bedrock-convert-request',
            () => Promise.resolve(this.convertToBedrockRequest(request))
          );
          
          if (this.debugMode && bedrockRequest.tools?.length) {
            console.log(`Bedrock request with ${bedrockRequest.tools.length} tools:`, 
              bedrockRequest.tools.map(t => t.name).join(', '));
          }
          
          const input: InvokeModelCommandInput = {
            modelId: this.bedrockModelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(bedrockRequest),
          };

          const command = new InvokeModelCommand(input);
          const response = await this.performanceMonitor.timeAsync(
            'bedrock-api-call',
            () => this.client.send(command),
            { model: this.bedrockModelId, messageCount: bedrockRequest.messages.length }
          );
          
          const responseBody = await this.performanceMonitor.timeAsync(
            'bedrock-parse-response',
            () => this.parseResponseBody(response.body)
          );
          
          if (this.debugMode) {
            console.log(`Bedrock response - stop_reason: ${responseBody.stop_reason}, content types:`, 
              responseBody.content.map(c => c.type).join(', '));
            
            const toolCalls = responseBody.content.filter(c => c.type === 'tool_use');
            if (toolCalls.length > 0) {
              console.log(`Claude made ${toolCalls.length} tool calls:`, toolCalls.map(tc => tc.name));
            }
          }
          
          const convertedResponse = this.performanceMonitor.timeSync(
            'bedrock-convert-response',
            () => this.convertFromBedrockResponse(responseBody)
          );
          
          if (this.debugMode) {
            const tokens = convertedResponse.usageMetadata?.totalTokenCount || 0;
            console.log(`[BEDROCK-GEN] ✅ Request completed successfully. Used ${tokens} tokens.`);
          }

          return convertedResponse;
        }, {
          onRetry: this.onRetryCallback, // Use callback if provided
        });
      },
      { userPromptId, model: this.bedrockModelId }
    );
  }

  private async parseResponseBody(body: Uint8Array | undefined): Promise<BedrockResponse> {
    if (!body) {
      throw new Error('No response body from Bedrock');
    }
    
    try {
      // Use async parsing to avoid blocking the event loop
      const text = new TextDecoder().decode(body);
      return JSON.parse(text) as BedrockResponse;
    } catch (error) {
      throw new Error(`Failed to parse Bedrock response: ${getErrorMessage(error)}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    if (this.debugMode) {
      console.log(`[BEDROCK-GEN] generateContentStream called - UserPromptId: ${userPromptId}`);
    }
    
    // Create a retryable stream wrapper
    return this.createRetryableStream(request, userPromptId);
  }

  private async *createRetryableStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    let attempt = 0;
    const maxRetries = 5; // More persistent streaming retries like Claude Code
    const initialDelayMs = 2000;
    const backoffMultiplier = 2;
    const jitterMs = 1000;

    while (attempt <= maxRetries) {
      try {
        if (this.debugMode && attempt > 0) {
          console.log(`[BEDROCK-GEN] 🔄 Stream retry attempt ${attempt + 1}/${maxRetries + 1}`);
        }

        // Create a new stream for each attempt
        const stream = this.doGenerateContentStream(request, userPromptId);
        
        // Consume the entire stream and collect responses
        const responses: GenerateContentResponse[] = [];
        for await (const response of stream) {
          responses.push(response);
        }
        
        // If we get here, the stream was successful - yield all responses
        for (const response of responses) {
          yield response;
        }
        
        if (this.debugMode && attempt > 0) {
          console.log(`[BEDROCK-GEN] ✅ Stream retry attempt ${attempt + 1} succeeded`);
        }
        
        return; // Success, exit the retry loop

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if error is retryable
        const isRetryable = this.isStreamRetryableError(errorMessage);
        
        if (!isRetryable || attempt === maxRetries) {
          if (this.debugMode) {
            console.log(`[BEDROCK-GEN] ❌ Stream error not retryable or max retries reached: ${errorMessage}`);
          }
          throw error; // Not retryable or max retries reached
        }

        // Calculate delay with exponential backoff
        const delayMs = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt),
          20000 // maxDelayMs - longer for streaming
        );
        const jitter = Math.random() * jitterMs;
        const totalDelay = delayMs + jitter;

        // Claude Code style streaming retry logging
        const delaySeconds = Math.round(totalDelay / 1000);
        const errorType = errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('too many tokens')
          ? 'Rate limited'
          : errorMessage.toLowerCase().includes('timeout')
          ? 'Request timed out'
          : 'Stream error';
        
        // Emit retry event if callback provided, otherwise fallback to console.log
        if (this.onRetryCallback) {
          this.onRetryCallback(attempt + 1, maxRetries + 1, delaySeconds, errorType);
        } else {
          console.log(`✕ API Error (${errorType}) · Retrying in ${delaySeconds} seconds… (stream attempt ${attempt + 1}/${maxRetries + 1})`);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        attempt++;
      }
    }
  }

  private isStreamRetryableError(errorMessage: string): boolean {
    const errorString = errorMessage.toLowerCase();
    
    // Check for wrapped Bedrock streaming errors first
    if (errorString.includes('bedrock streaming error:')) {
      // Extract the inner error message after the wrapper
      const innerError = errorString.split('bedrock streaming error:')[1]?.trim() || errorString;
      return this.isRetryableErrorCore(innerError);
    }
    
    return this.isRetryableErrorCore(errorString);
  }

  private isRetryableErrorCore(errorString: string): boolean {
    return (
      errorString.includes('too many tokens') ||
      errorString.includes('throttlingexception') ||
      errorString.includes('toomanyrequestsexception') ||
      errorString.includes('rate limit') ||
      errorString.includes('rate-limit') ||
      errorString.includes('quota exceeded') ||
      errorString.includes('service unavailable') ||
      errorString.includes('timeout') ||
      errorString.includes('503') ||
      errorString.includes('502') ||
      errorString.includes('429') ||
      errorString.includes('network') ||
      errorString.includes('connection') ||
      errorString.includes('econnreset') ||
      errorString.includes('enotfound') ||
      errorString.includes('etimedout')
    );
  }

  private async *doGenerateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      if (this.debugMode) {
        console.log(`[BEDROCK-GEN] 🌊 doGenerateContentStream called - UserPromptId: ${userPromptId}`);
        console.log(`[BEDROCK-GEN] Making streaming API call to ${this.bedrockModelId} in ${this.region}...`);
      }

      const bedrockRequest = this.convertToBedrockRequest(request);
      
      if (this.debugMode && bedrockRequest.tools?.length) {
        console.log(`[BEDROCK-GEN] Streaming request with ${bedrockRequest.tools.length} tools`);
      }
      
      const input: InvokeModelWithResponseStreamCommandInput = {
        modelId: this.bedrockModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(bedrockRequest),
      };

      const command = new InvokeModelWithResponseStreamCommand(input);
      const response = await this.client.send(command);
      
      if (!response.body) {
        throw new Error('No response body from Bedrock');
      }

      let accumulatedText = '';
      let currentToolUse: { id: string; name: string; input: any; inputBuffer?: string } | null = null;
      let totalTokensUsed = 0; // Track actual token usage
      const decoder = new TextDecoder();

      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = await this.parseStreamChunk(chunk.chunk.bytes, decoder);
          
          if (chunkData.type === 'content_block_start' && chunkData.content_block?.type === 'tool_use') {
            if (this.debugMode) {
              console.log(`[BEDROCK-GEN] Found tool_use block: ${chunkData.content_block.name}`);
            }
            currentToolUse = {
              id: chunkData.content_block.id || '',
              name: chunkData.content_block.name || '',
              input: {}
            };
          } else if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
            accumulatedText += chunkData.delta.text;
            
            const chunkResponse = new GenerateContentResponse();
            chunkResponse.candidates = [
              {
                content: {
                  role: 'model',
                  parts: [{ text: chunkData.delta.text }],
                },
                finishReason: FinishReason.STOP,
                index: 0,
              },
            ];
            yield chunkResponse;
          } else if (chunkData.type === 'content_block_delta' && currentToolUse) {
            const inputDelta = chunkData.delta?.partial_json || chunkData.delta?.input || (chunkData as any).input_delta;
            if (inputDelta) {
              currentToolUse.inputBuffer = (currentToolUse.inputBuffer || '') + inputDelta;
            }
          } else if (chunkData.type === 'content_block_stop' && currentToolUse) {
            if (currentToolUse.inputBuffer) {
              try {
                currentToolUse.input = JSON.parse(currentToolUse.inputBuffer);
              } catch (error) {
                if (this.debugMode) {
                  console.warn(`[BEDROCK-GEN] Failed to parse tool input JSON:`, currentToolUse.inputBuffer);
                }
                currentToolUse.input = {};
              }
            }
            
            const toolResponse = new GenerateContentResponse();
            toolResponse.candidates = [
              {
                content: {
                  role: 'model',
                  parts: [{
                    functionCall: {
                      name: currentToolUse.name,
                      args: currentToolUse.input,
                      id: currentToolUse.id,
                    },
                  }],
                },
                finishReason: FinishReason.STOP,
                index: 0,
              },
            ];
            
            if (this.debugMode) {
              console.log(`[BEDROCK-GEN] Yielding tool call: ${currentToolUse.name}`);
            }
            yield toolResponse;
            currentToolUse = null;
          } else if (chunkData.type === 'message_delta' && chunkData.delta?.stop_reason) {
            const finishReason = this.mapStopReason(chunkData.delta.stop_reason) as FinishReason;
            
            const finalResponse = new GenerateContentResponse();
            finalResponse.candidates = [
              {
                content: {
                  role: 'model',
                  parts: accumulatedText ? [{ text: accumulatedText }] : [],
                },
                finishReason,
                index: 0,
              },
            ];
            if (chunkData.message?.usage) {
              totalTokensUsed = chunkData.message.usage.input_tokens + chunkData.message.usage.output_tokens;
              finalResponse.usageMetadata = {
                promptTokenCount: chunkData.message.usage.input_tokens,
                candidatesTokenCount: chunkData.message.usage.output_tokens,
                totalTokenCount: totalTokensUsed,
              } as GenerateContentResponseUsageMetadata;
            }
            yield finalResponse;
          }
        }
      }
      
      if (this.debugMode) {
        console.log(`[BEDROCK-GEN] ✅ Streaming request completed successfully. Used ${totalTokensUsed} tokens.`);
      }
    } catch (error) {
      throw new Error(`Bedrock streaming error: ${getErrorMessage(error)}`);
    }
  }

  private async parseStreamChunk(bytes: Uint8Array, decoder: TextDecoder): Promise<BedrockStreamChunk> {
    try {
      const text = decoder.decode(bytes);
      return JSON.parse(text) as BedrockStreamChunk;
    } catch (error) {
      throw new Error(`Failed to parse stream chunk: ${getErrorMessage(error)}`);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Bedrock doesn't have a direct token counting API
    // We'll estimate based on typical Claude tokenization
    const text = JSON.stringify(request.contents);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Bedrock Claude models don't support embeddings
    // You would need to use a different model like Amazon Titan Embeddings
    throw new Error('Embeddings are not supported with Claude models on Bedrock');
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

  private convertToBedrockRequest(request: GenerateContentParameters): BedrockRequest {
    const messages: BedrockMessage[] = [];
    let systemPrompt: string | undefined;
    
    // Extract system prompt from request configuration
    if ((request as any).systemInstruction) {
      systemPrompt = (request as any).systemInstruction;
    } else if ((request as any).config?.systemInstruction) {
      systemPrompt = (request as any).config.systemInstruction;
    } else if ((request as any).generationConfig?.systemInstruction) {
      systemPrompt = (request as any).generationConfig.systemInstruction;
    }

    // Convert Gemini format to Bedrock/Claude format
    const contents = this.normalizeContents(request.contents);
    
    
    // Track tool_use IDs to ensure proper pairing
    const toolUseIds = new Set<string>();
    const toolResultIds = new Set<string>();
    let orphanedToolResultCount = 0;
    
    // First pass: collect all tool_use IDs
    for (const content of contents) {
      if ((content.role === 'assistant' || content.role === 'model') && content.parts) {
        for (const part of content.parts) {
          if ((part as any).functionCall?.id) {
            const toolId = (part as any).functionCall.id;
            toolUseIds.add(toolId);
          }
        }
      }
    }
    
    // Second pass: identify orphaned tool results
    for (const content of contents) {
      if (content.role === 'user' && content.parts) {
        for (const part of content.parts) {
          if ((part as any).functionResponse?.id) {
            const toolId = (part as any).functionResponse.id;
            toolResultIds.add(toolId);
            if (!toolUseIds.has(toolId)) {
              orphanedToolResultCount++;
              console.log(`⚠ Found orphaned tool_result with ID: ${toolId} - no matching tool_use found`);
            }
          }
        }
      }
    }
    
    // Convert tools to Bedrock format with caching
    let tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined;
    if ((request as any).config?.tools && Array.isArray((request as any).config.tools)) {
      // Create cache key based on tool definitions
      const toolsKey = JSON.stringify((request as any).config.tools);
      
      if (BedrockContentGenerator.toolSchemaCache.has(toolsKey)) {
        tools = BedrockContentGenerator.toolSchemaCache.get(toolsKey);
      } else {
        tools = (request as any).config.tools.map((tool: any) => {
          // Handle both Gemini format (functionDeclarations) and direct tool format
          let name: string;
          let description: string;
          let originalSchema: any;
          
          if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length > 0) {
            // Gemini format: { functionDeclarations: [{ name, description, parametersJsonSchema }] }
            const funcDecl = tool.functionDeclarations[0];
            name = funcDecl.name;
            description = funcDecl.description || '';
            originalSchema = funcDecl.parametersJsonSchema || funcDecl.parameters || {};
          } else {
            // Direct tool format: { name, description, parameters }
            name = tool.name;
            description = tool.description || '';
            originalSchema = tool.parameters || {};
          }
          
          if (!name) {
            if (this.debugMode) {
              console.warn('Tool is missing name, skipping:', tool);
            }
            return null;
          }
          
          // Ensure the schema has required Bedrock fields
          let input_schema = {
            type: 'object',
            properties: originalSchema.properties || {},
            required: originalSchema.required || [],
            ...originalSchema
          };
          
          // Special handling for list_directory - use minimal schema format
          if (name === 'list_directory') {
            input_schema = {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to directory'
                }
              },
              required: ['path']
            };
            description = 'Lists files in a directory';
          }
          
          // Ensure required array exists for Bedrock compatibility
          if (!Array.isArray(input_schema.required)) {
            input_schema.required = [];
          }
          
          if (this.debugMode) {
            console.log(`Converting tool "${name}" for Bedrock`);
          }
          
          return {
            name,
            description,
            input_schema
          };
        }).filter(Boolean); // Remove null entries
        
        // Cache the converted tools
        BedrockContentGenerator.toolSchemaCache.set(toolsKey, tools || []);
      }
    }
    
    // Only start fresh if we have many consecutive orphaned results (indicates a real loop)
    // Also check the ratio - if most tool results are orphaned, we have a structural problem
    const totalToolResults = toolResultIds.size;
    const orphanedRatio = totalToolResults > 0 ? orphanedToolResultCount / totalToolResults : 0;
    
    // Start fresh only when we have multiple orphaned tool results AND a high ratio
    // This indicates actual conversation corruption rather than normal tool execution
    const shouldStartFresh = orphanedToolResultCount >= 3 && orphanedRatio >= 0.8;
    
    if (shouldStartFresh) {
      if (this.debugMode) {
        console.log(`Found ${orphanedToolResultCount} orphaned tool results out of ${totalToolResults} total (${Math.round(orphanedRatio * 100)}%) - starting fresh conversation`);
      }
      
      // Find the most recent user message to preserve the current request
      let latestUserMessage = `Please list the files in the current directory using the list_directory tool with the path parameter set to "${process.cwd()}".`;
      for (let i = contents.length - 1; i >= 0; i--) {
        const content = contents[i];
        if (content.role === 'user' && content.parts) {
          const textParts = content.parts.filter((part: any) => part.text && !part.text.includes('Analyze *only*'));
          if (textParts.length > 0) {
            const fullMessage = textParts.map((part: any) => part.text).join(' ');
            if (!fullMessage.includes('Analyze *only*') && !fullMessage.includes('preceding response')) {
              latestUserMessage = fullMessage;
              break;
            }
          }
        }
      }
      
      const freshRequest = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: (request as any).generationConfig?.maxOutputTokens || 4096,
        messages: [
          {
            role: 'user' as const,
            content: latestUserMessage,
          }
        ],
        temperature: (request as any).generationConfig?.temperature,
        top_p: (request as any).generationConfig?.topP,
        top_k: (request as any).generationConfig?.topK,
        system: systemPrompt,
        ...(tools && tools.length > 0 && { tools }),
      };
      
      if (this.debugMode) {
        console.log('Fresh conversation request:', {
          messageCount: freshRequest.messages.length,
          toolCount: freshRequest.tools?.length || 0
        });
      }
      
      return freshRequest;
    }
    
    for (const content of contents) {
      if (content.role === 'system') {
        // Bedrock uses a separate system field
        systemPrompt = content.parts?.map((part: any) => part.text || '').join('\n');
      } else if (content.role === 'user' || content.role === 'assistant' || content.role === 'model') {
        const bedrockContent = this.convertParts(content.parts || [], toolUseIds);
        
        // Handle message content based on type
        if (Array.isArray(bedrockContent)) {
          // Check if this message has any valid content after filtering
          const validContent = bedrockContent.filter(part => {
            // Keep text content always
            if (part.type === 'text') return true;
            // Keep tool_use always (these are from assistant)
            if (part.type === 'tool_use') return true;
            // Keep tool_result only if it has a matching tool_use
            if (part.type === 'tool_result') {
              return toolUseIds.has(part.tool_use_id || '');
            }
            return true;
          });
          
          if (validContent.length === 0) {
            if (this.debugMode) {
              console.log(`Skipping message with no valid content for ${content.role}`);
            }
            continue; // Skip this entire message
          }
          
          // Special handling for messages with tool_use: Remove any text parts that come after the LAST tool_use
          // This is because Bedrock expects clean tool_use messages without trailing text
          // But we need to keep ALL tool_use blocks, not just the first one
          const lastToolUseIndex = validContent.map((part, index) => part.type === 'tool_use' ? index : -1)
            .filter(index => index !== -1)
            .pop();
          
          if (lastToolUseIndex !== undefined) {
            // Keep everything up to and including the last tool_use, but remove any text after it
            const cleanedContent = validContent.slice(0, lastToolUseIndex + 1);
            
            if (this.debugMode) {
              console.log(`Message with ${cleanedContent.filter(p => p.type === 'tool_use').length} tool_use blocks after cleaning`);
            }
            
            messages.push({
              role: (content.role === 'model' ? 'assistant' : content.role) as 'user' | 'assistant',
              content: cleanedContent.length === 1 && cleanedContent[0].type === 'text' 
                ? cleanedContent[0].text! 
                : cleanedContent,
            });
          } else {
            messages.push({
              role: (content.role === 'model' ? 'assistant' : content.role) as 'user' | 'assistant',
              content: validContent.length === 1 && validContent[0].type === 'text' 
                ? validContent[0].text! 
                : validContent,
            });
          }
        } else {
          // Single text content
          messages.push({
            role: (content.role === 'model' ? 'assistant' : content.role) as 'user' | 'assistant',
            content: bedrockContent,
          });
        }
      }
    }

    // Access generation config from the request
    const config = (request as any).generationConfig;

    const bedrockRequest = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config?.maxOutputTokens || 4096,
      messages,
      temperature: config?.temperature,
      top_p: config?.topP,
      top_k: config?.topK,
      system: systemPrompt,
      ...(tools && tools.length > 0 && { tools }),
    };

    if (this.debugMode) {
      console.log('Bedrock request debug - Message count:', messages.length);
    }

    return bedrockRequest;
  }

  private convertParts(parts: any[], toolUseIds?: Set<string>): string | Array<{ type: string; text?: string; id?: string; name?: string; input?: any; tool_use_id?: string; content?: string }> {
    const convertedParts = [];
    
    for (const part of parts) {
      if (part.text) {
        convertedParts.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        // Convert function calls to tool use format
        // CRITICAL: Always use the existing ID if available, never generate new ones during conversion
        // This ensures tool_use and tool_result IDs match exactly
        const toolUseId = part.functionCall.id;
        
        if (!toolUseId) {
          if (this.debugMode) {
            console.warn('Missing function call ID - this may cause tool_use_id mismatch errors');
          }
          // Skip this function call if no ID is provided
          continue;
        }
        
        if (this.debugMode) {
          console.log(`Converting functionCall to tool_use: ${part.functionCall.name} with ID: ${toolUseId}`);
        }
        
        convertedParts.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name,
          input: part.functionCall.args,
        });
      } else if (part.functionResponse) {
        // Convert function responses to tool result format
        // The tool_use_id should match the ID from the original tool_use block
        // Check for id in the functionResponse object (this is where our system puts it)
        const toolUseId = part.functionResponse.id;
        
        if (!toolUseId) {
          if (this.debugMode) {
            console.warn('Missing tool ID in functionResponse:', part.functionResponse);
          }
          // Skip this tool result if we can't match it to a tool_use
          continue;
        }
        
        if (this.debugMode) {
          console.log(`Processing tool_result with ID: ${toolUseId}, available tool_use IDs: ${Array.from(toolUseIds || []).join(', ')}`);
        }
        
        // Skip orphaned tool results (those without corresponding tool_use blocks)
        if (toolUseIds && !toolUseIds.has(toolUseId)) {
          if (this.debugMode) {
            console.log(`Skipping orphaned tool_result with ID: ${toolUseId} - no matching tool_use found`);
          }
          continue;
        }
        
        if (this.debugMode) {
          console.log(`Converting functionResponse to tool_result with ID: ${toolUseId}`);
        }
        
        convertedParts.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: JSON.stringify(part.functionResponse.response),
        });
      }
    }

    return convertedParts.length === 1 && convertedParts[0].type === 'text' 
      ? convertedParts[0].text! 
      : convertedParts;
  }

  private convertFromBedrockResponse(response: BedrockResponse): GenerateContentResponse {
    const parts = [];
    
    for (const content of response.content) {
      if (content.type === 'text' && content.text) {
        parts.push({ text: content.text });
      } else if (content.type === 'tool_use') {
        if (this.debugMode) {
          console.log(`[BEDROCK CONVERT] Converting tool_use to functionCall: ${content.name}`);
          
          if (content.name === 'list_directory') {
            if (!content.input || Object.keys(content.input || {}).length === 0) {
              console.log(`[BEDROCK CONVERT] WARNING: Claude sent empty input for list_directory`);
            }
          }
        }
        
        parts.push({
          functionCall: {
            name: content.name!,
            args: content.input,
            // Preserve the tool ID for when we need to send the result back
            id: content.id,
          } as FunctionCall,
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
        finishReason: this.mapStopReason(response.stop_reason),
        index: 0,
      },
    ];
    result.usageMetadata = {
      promptTokenCount: response.usage.input_tokens,
      candidatesTokenCount: response.usage.output_tokens,
      totalTokenCount: response.usage.input_tokens + response.usage.output_tokens,
    } as GenerateContentResponseUsageMetadata;
    return result;
  }

  private mapStopReason(stopReason: string | null): FinishReason {
    if (!stopReason) return 'stop' as FinishReason;
    
    switch (stopReason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop' as FinishReason;
      case 'tool_use':
        return 'stop' as FinishReason; // Claude wants to use tools, this is normal completion
      case 'max_tokens':
        return 'maxOutputTokens' as FinishReason;
      case 'content_filtered':
        return 'safety' as FinishReason;
      default:
        return 'other' as FinishReason;
    }
  }

  // Removed estimateTokens method - no longer needed without quota management
}