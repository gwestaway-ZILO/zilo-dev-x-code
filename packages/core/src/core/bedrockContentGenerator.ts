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

  constructor(model: string, region?: string) {
    // Map the model name to the correct inference profile
    // First check if it's already a full inference profile
    if (model.includes('.anthropic.')) {
      this.bedrockModelId = model;
    } else {
      // Map user-friendly names to inference profiles
      this.bedrockModelId = BEDROCK_MODEL_IDS[model] || BEDROCK_MODEL_IDS['default'];
    }
    
    console.log(`Using Bedrock inference profile: ${this.bedrockModelId}`);
    
    // Initialize AWS Bedrock client
    this.client = new BedrockRuntimeClient({
      region: region || process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    try {
      const bedrockRequest = this.convertToBedrockRequest(request);
      
      const input: InvokeModelCommandInput = {
        modelId: this.bedrockModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(bedrockRequest),
      };

      const command = new InvokeModelCommand(input);
      const response = await this.client.send(command);
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as BedrockResponse;
      return this.convertFromBedrockResponse(responseBody);
    } catch (error) {
      throw new Error(`Bedrock API error: ${getErrorMessage(error)}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.doGenerateContentStream(request, userPromptId);
  }

  private async *doGenerateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      const bedrockRequest = this.convertToBedrockRequest(request);
      
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

      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes)) as BedrockStreamChunk;
          
          if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
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
          } else if (chunkData.type === 'message_delta' && chunkData.delta?.stop_reason) {
            // Final message with usage metadata
            const finishReason = this.mapStopReason(chunkData.delta.stop_reason) as FinishReason;
            
            const finalResponse = new GenerateContentResponse();
            finalResponse.candidates = [
              {
                content: {
                  role: 'model',
                  parts: [{ text: accumulatedText }],
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

    // Convert Gemini format to Bedrock/Claude format
    const contents = this.normalizeContents(request.contents);
    for (const content of contents) {
      if (content.role === 'system') {
        // Bedrock uses a separate system field
        systemPrompt = content.parts?.map((part: any) => part.text || '').join('\n');
      } else if (content.role === 'user' || content.role === 'assistant') {
        const bedrockContent = this.convertParts(content.parts || []);
        messages.push({
          role: content.role as 'user' | 'assistant',
          content: bedrockContent,
        });
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
    };
  }

  private convertParts(parts: any[]): string | Array<{ type: string; text?: string; name?: string; input?: any }> {
    const convertedParts = [];
    
    for (const part of parts) {
      if (part.text) {
        convertedParts.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        // Convert function calls to tool use format
        convertedParts.push({
          type: 'tool_use',
          name: part.functionCall.name,
          input: part.functionCall.args,
        });
      } else if (part.functionResponse) {
        // Convert function responses to tool result format
        convertedParts.push({
          type: 'tool_result',
          name: part.functionResponse.name,
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
        parts.push({
          functionCall: {
            name: content.name!,
            args: content.input,
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
      case 'max_tokens':
        return 'maxOutputTokens' as FinishReason;
      case 'content_filtered':
        return 'safety' as FinishReason;
      default:
        return 'other' as FinishReason;
    }
  }
}