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
  private static loggedProfiles = new Set<string>();

  constructor(model: string, region?: string) {
    console.log(`[BEDROCK-GEN] 🚀 BedrockContentGenerator constructor called`);
    console.log(`[BEDROCK-GEN] Model: ${model}`);
    console.log(`[BEDROCK-GEN] Region: ${region || 'default'}`);
    
    // Map the model name to the correct inference profile
    // First check if it's already a full inference profile
    if (model.includes('.anthropic.')) {
      this.bedrockModelId = model;
    } else {
      // Map user-friendly names to inference profiles
      this.bedrockModelId = BEDROCK_MODEL_IDS[model] || BEDROCK_MODEL_IDS['default'];
    }
    
    console.log(`[BEDROCK-GEN] Final model ID: ${this.bedrockModelId}`);
    
    // Only log each profile once to prevent duplicate messages
    if (!BedrockContentGenerator.loggedProfiles.has(this.bedrockModelId)) {
      console.log(`Using Bedrock inference profile: ${this.bedrockModelId}`);
      BedrockContentGenerator.loggedProfiles.add(this.bedrockModelId);
    }
    
    // Initialize AWS Bedrock client
    this.client = new BedrockRuntimeClient({
      region: region || process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
    });
    
    console.log(`[BEDROCK-GEN] ✅ BedrockContentGenerator initialized`);
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    console.log(`[BEDROCK-GEN] 📞 generateContent called`);
    console.log(`[BEDROCK-GEN] UserPromptId: ${userPromptId}`);
    
    try {
      const bedrockRequest = this.convertToBedrockRequest(request);
      
      // Log tool information for debugging
      if (bedrockRequest.tools && bedrockRequest.tools.length > 0) {
        console.log(`Bedrock request with ${bedrockRequest.tools.length} tools:`, 
          bedrockRequest.tools.map(t => t.name).join(', '));
      }
      
      // Debug: Log the complete request being sent to Bedrock
      console.log('=== COMPLETE BEDROCK REQUEST ===');
      console.log('System prompt:', bedrockRequest.system?.substring(0, 200) + '...');
      console.log('Messages count:', bedrockRequest.messages.length);
      console.log('Tools count:', bedrockRequest.tools?.length || 0);
      if (bedrockRequest.tools && bedrockRequest.tools.length > 0) {
        console.log('=== TOOLS SENT TO CLAUDE ===');
        bedrockRequest.tools.forEach((tool, idx) => {
          console.log(`Tool ${idx + 1}:`, {
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          });
        });
      }
      console.log('=== END BEDROCK REQUEST ===');
      
      // Log message structure for debugging tool_use/tool_result pairing
      console.log('Bedrock request messages:');
      bedrockRequest.messages.forEach((msg, index) => {
        console.log(`Message ${index} (${msg.role}):`, {
          contentLength: Array.isArray(msg.content) ? msg.content.length : 1,
          contentTypes: Array.isArray(msg.content) ? msg.content.map((c: any) => c.type).join(', ') : 'text',
          hasToolUse: Array.isArray(msg.content) ? msg.content.some((c: any) => c.type === 'tool_use') : false,
          hasToolResult: Array.isArray(msg.content) ? msg.content.some((c: any) => c.type === 'tool_result') : false,
        });
        
        // If this message has tool_use or tool_result, log the IDs
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part: any, partIndex: number) => {
            if (part.type === 'tool_use') {
              console.log(`  Part ${partIndex}: tool_use ID=${part.id}, name=${part.name}`);
            } else if (part.type === 'tool_result') {
              console.log(`  Part ${partIndex}: tool_result tool_use_id=${part.tool_use_id}`);
            }
          });
        }
      });
      
      // Log the complete tool schema being sent to Claude
      if (bedrockRequest.tools && bedrockRequest.tools.length > 0) {
        console.log('Complete tool schemas sent to Claude:');
        bedrockRequest.tools.forEach(tool => {
          console.log(`Tool: ${tool.name}`);
          console.log(`  Required fields:`, tool.input_schema['required']);
          console.log(`  Properties:`, Object.keys(tool.input_schema['properties'] || {}));
        });
      }
      
      const input: InvokeModelCommandInput = {
        modelId: this.bedrockModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(bedrockRequest),
      };

      const command = new InvokeModelCommand(input);
      console.log('🚀 About to send Bedrock API request...');
      const response = await this.client.send(command);
      console.log('✅ Received Bedrock API response:', response ? 'Success' : 'Failed');
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as BedrockResponse;
      
      // Log response details for debugging
      console.log(`Bedrock response - stop_reason: ${responseBody.stop_reason}, content types:`, 
        responseBody.content.map(c => c.type).join(', '));
      
      // Debug: Log the complete Bedrock response to see what Claude is actually sending
      console.log('=== COMPLETE BEDROCK RESPONSE ===');
      console.log(JSON.stringify(responseBody, null, 2));
      console.log('=== END BEDROCK RESPONSE ===');
      
      // Log if Claude is making tool calls
      const toolCalls = responseBody.content.filter(c => c.type === 'tool_use');
      if (toolCalls.length > 0) {
        console.log(`Claude made ${toolCalls.length} tool calls:`);
        toolCalls.forEach(tc => {
          console.log(`  - ${tc.name}:`, JSON.stringify(tc.input, null, 2));
          console.log(`    ID: ${tc.id}`);
          
          // Debug: Check if this is the problematic empty call
          if (tc.name === 'list_directory' && (!tc.input || Object.keys(tc.input || {}).length === 0)) {
            console.log(`    ⚠️  DETECTED EMPTY TOOL CALL from Claude!`);
            console.log(`    ⚠️  Claude sent empty input:`, tc.input);
            console.log(`    ⚠️  This suggests Claude is not understanding the tool schema correctly`);
          }
        });
      } else {
        console.log('Claude made no tool calls in this response');
        console.log('Response content types:', responseBody.content.map(c => c.type).join(', '));
        console.log('Stop reason:', responseBody.stop_reason);
      }
      
      return this.convertFromBedrockResponse(responseBody);
    } catch (error) {
      throw new Error(`Bedrock API error: ${getErrorMessage(error)}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.log(`[BEDROCK-GEN] 📞 generateContentStream called`);
    console.log(`[BEDROCK-GEN] UserPromptId: ${userPromptId}`);
    
    return this.doGenerateContentStream(request, userPromptId);
  }

  private async *doGenerateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    console.log(`[BEDROCK-GEN] 🔄 doGenerateContentStream starting...`);
    
    try {
      const bedrockRequest = this.convertToBedrockRequest(request);
      
      // Log tool information for debugging
      if (bedrockRequest.tools && bedrockRequest.tools.length > 0) {
        console.log(`[BEDROCK-GEN] Streaming request with ${bedrockRequest.tools.length} tools`);
      }
      
      const input: InvokeModelWithResponseStreamCommandInput = {
        modelId: this.bedrockModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(bedrockRequest),
      };

      const command = new InvokeModelWithResponseStreamCommand(input);
      console.log(`[BEDROCK-GEN] 🚀 About to send Bedrock STREAMING API request...`);
      const response = await this.client.send(command);
      console.log(`[BEDROCK-GEN] ✅ Received Bedrock STREAMING API response`);
      
      if (!response.body) {
        throw new Error('No response body from Bedrock');
      }

      let accumulatedText = '';
      let currentToolUse: { id: string; name: string; input: any; inputBuffer?: string } | null = null;

      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes)) as BedrockStreamChunk;
          console.log(`[BEDROCK-GEN] 📦 Stream chunk type: ${chunkData.type}`, chunkData.type === 'content_block_start' ? chunkData.content_block : chunkData.type === 'content_block_delta' ? chunkData.delta : {});
          
          if (chunkData.type === 'content_block_start' && chunkData.content_block?.type === 'tool_use') {
            // Start of a tool use block
            console.log(`[BEDROCK-GEN] 🔧 Found tool_use block:`, chunkData.content_block);
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
            // Accumulate tool input JSON chunks - try different possible field names
            const inputDelta = chunkData.delta?.partial_json || chunkData.delta?.input || (chunkData as any).input_delta;
            if (inputDelta) {
              console.log(`[BEDROCK-GEN] 🔧 Accumulating tool input delta:`, inputDelta);
              if (!currentToolUse.inputBuffer) {
                currentToolUse.inputBuffer = '';
              }
              currentToolUse.inputBuffer += inputDelta;
            } else {
              console.log(`[BEDROCK-GEN] 🔧 content_block_delta for tool but no input delta found:`, chunkData.delta);
            }
          } else if (chunkData.type === 'content_block_stop' && currentToolUse) {
            // Complete tool use block - parse accumulated input JSON
            if (currentToolUse.inputBuffer) {
              try {
                currentToolUse.input = JSON.parse(currentToolUse.inputBuffer);
                console.log(`[BEDROCK-GEN] 🔧 Parsed tool input from buffer:`, currentToolUse.input);
              } catch (error) {
                console.warn(`[BEDROCK-GEN] ⚠️ Failed to parse tool input JSON:`, currentToolUse.inputBuffer, error);
                currentToolUse.input = {};
              }
            }
            console.log(`[BEDROCK-GEN] 🔧 Completing tool_use:`, currentToolUse);
            const toolResponse = new GenerateContentResponse();
            toolResponse.candidates = [
              {
                content: {
                  role: 'model',
                  parts: [{
                    functionCall: {
                      name: currentToolUse.name,
                      args: currentToolUse.input,
                      // Preserve the tool ID for when we need to send the result back
                      id: currentToolUse.id,
                    },
                  }],
                },
                finishReason: FinishReason.STOP,
                index: 0,
              },
            ];
            console.log(`[BEDROCK-GEN] 🔧 Yielding tool call:`, { name: currentToolUse.name, args: currentToolUse.input, id: currentToolUse.id });
            yield toolResponse;
            currentToolUse = null;
          } else if (chunkData.type === 'message_delta' && chunkData.delta?.stop_reason) {
            // Final message with usage metadata
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
              finalResponse.usageMetadata = {
                promptTokenCount: chunkData.message.usage.input_tokens,
                candidatesTokenCount: chunkData.message.usage.output_tokens,
                totalTokenCount: chunkData.message.usage.input_tokens + chunkData.message.usage.output_tokens,
              } as GenerateContentResponseUsageMetadata;
            }
            yield finalResponse;
          }
        }
      }
    } catch (error) {
      throw new Error(`Bedrock streaming error: ${getErrorMessage(error)}`);
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
    
    // Debug: Log system prompt availability and content
    console.log('System prompt availability:', {
      hasSystemInstruction: !!(request as any).systemInstruction,
      hasConfigSystemInstruction: !!(request as any).config?.systemInstruction,
      hasGenerationConfigSystemInstruction: !!(request as any).generationConfig?.systemInstruction,
      systemPromptLength: systemPrompt?.length || 0
    });
    
    if (systemPrompt) {
      console.log('=== SYSTEM PROMPT CONTENT ===');
      console.log('First 500 chars:', systemPrompt.substring(0, 500));
      console.log('Contains tool examples:', systemPrompt.includes('list_directory'));
      console.log('Contains parameter instructions:', systemPrompt.includes('NEVER call tools with empty parameters'));
      console.log('=== END SYSTEM PROMPT ===');
    }

    // Convert Gemini format to Bedrock/Claude format
    const contents = this.normalizeContents(request.contents);
    
    // Track tool_use IDs to ensure proper pairing
    const toolUseIds = new Set<string>();
    const toolResultIds = new Set<string>();
    let orphanedToolResultCount = 0;
    
    // First pass: collect all tool_use IDs
    for (const content of contents) {
      if (content.role === 'assistant' && content.parts) {
        for (const part of content.parts) {
          if ((part as any).functionCall?.id) {
            toolUseIds.add((part as any).functionCall.id);
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
    
    // Convert tools to Bedrock format early so we can use them if we need to start fresh
    let tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined;
    if ((request as any).config?.tools && Array.isArray((request as any).config.tools)) {
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
          // Check both parametersJsonSchema (correct field) and parameters (fallback)
          originalSchema = funcDecl.parametersJsonSchema || funcDecl.parameters || {};
        } else {
          // Direct tool format: { name, description, parameters }
          name = tool.name;
          description = tool.description || '';
          originalSchema = tool.parameters || {};
        }
        
        if (!name) {
          console.warn('Tool is missing name, skipping:', tool);
          return null;
        }
        
        // Ensure the schema has required Bedrock fields
        let input_schema = {
          type: 'object',
          properties: originalSchema.properties || {},
          required: originalSchema.required || [],
          ...originalSchema
        };
        
        // Special handling for list_directory - use minimal schema format like Anthropic native API
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
          console.log('Minimal list_directory schema for Claude (matching Anthropic native format):', input_schema);
        }
        
        // Ensure required array exists for Bedrock compatibility
        if (!Array.isArray(input_schema.required)) {
          input_schema.required = [];
        }
        
        console.log(`Converting tool "${name}" for Bedrock:`, { 
          name, 
          description: description.substring(0, 100) + '...', 
          input_schema: {
            type: input_schema.type,
            required: input_schema.required,
            propertyCount: Object.keys(input_schema.properties || {}).length
          }
        });
        
        // Debug: Log full tool definition being sent to Claude
        if (name === 'list_directory') {
          console.log('Full list_directory tool definition:', {
            name,
            description,
            input_schema
          });
        }
        
        return {
          name,
          description,
          input_schema
        };
      }).filter(Boolean); // Remove null entries
    }
    
    // Only start fresh if we have many consecutive orphaned results (indicates a real loop)
    // Also check the ratio - if most tool results are orphaned, we have a structural problem
    const totalToolResults = toolResultIds.size;
    const orphanedRatio = totalToolResults > 0 ? orphanedToolResultCount / totalToolResults : 0;
    
    // Start fresh much more aggressively - any orphaned results indicate conversation corruption
    const shouldStartFresh = orphanedToolResultCount > 0;
    
    if (shouldStartFresh) {
      console.log(`ℹ Found ${orphanedToolResultCount} orphaned tool results out of ${totalToolResults} total (${Math.round(orphanedRatio * 100)}%) - starting fresh conversation to avoid loops`);
      
      // Find the most recent user message to preserve the current request
      let latestUserMessage = `Please list the files in the current directory using the list_directory tool with the path parameter set to "${process.cwd()}".`;
      for (let i = contents.length - 1; i >= 0; i--) {
        const content = contents[i];
        if (content.role === 'user' && content.parts) {
          const textParts = content.parts.filter((part: any) => part.text && !part.text.includes('Analyze *only*'));
          if (textParts.length > 0) {
            const fullMessage = textParts.map((part: any) => part.text).join(' ');
            // Only use user messages that are actual requests, not analysis prompts
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
      
      console.log('Fresh conversation request:', {
        messageCount: freshRequest.messages.length,
        toolCount: freshRequest.tools?.length || 0,
        userMessage: latestUserMessage.substring(0, 100) + '...',
        hasSystem: !!freshRequest.system
      });
      
      // Debug: Log the complete fresh request to see what we're actually sending
      console.log('=== COMPLETE FRESH REQUEST ===');
      console.log(JSON.stringify(freshRequest, null, 2));
      console.log('=== END FRESH REQUEST ===');
      
      return freshRequest;
    }
    
    for (const content of contents) {
      if (content.role === 'system') {
        // Bedrock uses a separate system field
        systemPrompt = content.parts?.map((part: any) => part.text || '').join('\n');
      } else if (content.role === 'user' || content.role === 'assistant') {
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
            console.log(`Skipping message with no valid content for ${content.role}`);
            continue; // Skip this entire message
          }
          
          messages.push({
            role: content.role as 'user' | 'assistant',
            content: validContent.length === 1 && validContent[0].type === 'text' 
              ? validContent[0].text! 
              : validContent,
          });
        } else {
          // Single text content
          messages.push({
            role: content.role as 'user' | 'assistant',
            content: bedrockContent,
          });
        }
      }
    }

    // Access generation config from the request
    const config = (request as any).generationConfig;

    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config?.maxOutputTokens || 4096,
      messages,
      temperature: config?.temperature,
      top_p: config?.topP,
      top_k: config?.topK,
      system: systemPrompt,
      ...(tools && tools.length > 0 && { tools }),
    };
  }

  private convertParts(parts: any[], toolUseIds?: Set<string>): string | Array<{ type: string; text?: string; id?: string; name?: string; input?: any; tool_use_id?: string; content?: string }> {
    const convertedParts = [];
    
    for (const part of parts) {
      if (part.text) {
        convertedParts.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        // Convert function calls to tool use format
        // Use the existing ID if available, otherwise generate one
        const toolUseId = part.functionCall.id || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        
        console.log(`Converting functionCall to tool_use:`, {
          name: part.functionCall.name,
          args: part.functionCall.args,
          id: toolUseId
        });
        
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
          console.warn('Missing tool ID in functionResponse:', part.functionResponse);
          // Skip this tool result if we can't match it to a tool_use
          continue;
        }
        
        // Skip orphaned tool results (those without corresponding tool_use blocks)
        if (toolUseIds && !toolUseIds.has(toolUseId)) {
          console.log(`⚠ Skipping orphaned tool_result with ID: ${toolUseId} - no corresponding tool_use found`);
          continue;
        }
        
        console.log(`Converting tool result for tool_use_id: ${toolUseId}`);
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
        console.log(`[BEDROCK CONVERT] Converting tool_use to functionCall:`);
        console.log(`[BEDROCK CONVERT] Tool name: ${content.name}`);
        console.log(`[BEDROCK CONVERT] Tool input:`, JSON.stringify(content.input, null, 2));
        console.log(`[BEDROCK CONVERT] Input type:`, typeof content.input);
        console.log(`[BEDROCK CONVERT] Input keys:`, Object.keys(content.input || {}));
        
        if (content.name === 'list_directory') {
          if (!content.input || Object.keys(content.input || {}).length === 0) {
            console.log(`[BEDROCK CONVERT] ⚠️  DETECTED: Claude sent empty input for list_directory!`);
            console.log(`[BEDROCK CONVERT] ⚠️  This proves Claude is NOT providing correct parameters despite our debugging`);
          } else {
            console.log(`[BEDROCK CONVERT] ✅ Claude provided input for list_directory:`, content.input);
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
}