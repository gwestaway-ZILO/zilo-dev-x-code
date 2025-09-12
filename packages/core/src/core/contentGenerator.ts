/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL, DEFAULT_BEDROCK_MODEL } from '../config/models.js';
import type { Config } from '../config/config.js';
import { ClaudeContentGenerator } from './claudeContentGenerator.js';
import { BedrockContentGenerator } from './bedrockContentGenerator.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_CLAUDE_API = 'claude-api-key',
  USE_AWS_BEDROCK = 'aws-bedrock',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env['GEMINI_API_KEY'] || undefined;
  const googleApiKey = process.env['GOOGLE_API_KEY'] || undefined;
  const googleCloudProject = process.env['GOOGLE_CLOUD_PROJECT'] || undefined;
  const googleCloudLocation = process.env['GOOGLE_CLOUD_LOCATION'] || undefined;
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'] || undefined;
  const awsAccessKeyId = process.env['AWS_ACCESS_KEY_ID'] || undefined;
  const awsSecretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] || undefined;
  const awsRegion = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || undefined;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  // For Claude, always use Claude model regardless of config
  let effectiveModel: string;
  if (authType === AuthType.USE_CLAUDE_API) {
    // If using Claude auth, use Claude model (ignore any Gemini model setting)
    effectiveModel = DEFAULT_CLAUDE_MODEL;
  } else if (authType === AuthType.USE_AWS_BEDROCK) {
    // If using Bedrock auth, use effective model only if it's a Claude model, otherwise use default Bedrock model
    const configModel = config.getEffectiveModel();
    effectiveModel = (configModel && configModel.toLowerCase().includes('claude')) 
      ? configModel 
      : DEFAULT_BEDROCK_MODEL;
  } else {
    // For other auth types, use config model or default Gemini model
    effectiveModel = config.getEffectiveModel() || DEFAULT_GEMINI_MODEL;
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_CLAUDE_API && anthropicApiKey) {
    contentGeneratorConfig.apiKey = anthropicApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_AWS_BEDROCK && awsAccessKeyId && awsSecretAccessKey && awsRegion) {
    // AWS credentials are handled via SDK, not passed as apiKey
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  console.log(`[CONTENT-GEN] 🔍 Creating ContentGenerator...`);
  console.log(`[CONTENT-GEN] AuthType: ${config.authType}`);
  console.log(`[CONTENT-GEN] Model: ${config.model}`);
  console.log(`[CONTENT-GEN] API Key: ${config.apiKey ? '***set***' : 'undefined'}`);
  console.log(`[CONTENT-GEN] VertexAI: ${config.vertexai}`);
  
  const version = process.env['CLI_VERSION'] || process.version;
  const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent,
  };

  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    const httpOptions = { headers: baseHeaders };
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    let headers: Record<string, string> = { ...baseHeaders };
    if (gcConfig?.getUsageStatisticsEnabled()) {
      const installationManager = new InstallationManager();
      const installationId = installationManager.getInstallationId();
      headers = {
        ...headers,
        'x-gemini-api-privileged-user-id': `${installationId}`,
      };
    }
    const httpOptions = { headers };

    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  if (config.authType === AuthType.USE_CLAUDE_API) {
    console.log(`[CONTENT-GEN] ✅ Creating ClaudeContentGenerator`);
    if (!config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Claude API');
    }
    const claudeGenerator = new ClaudeContentGenerator(config.apiKey, config.model);
    return new LoggingContentGenerator(claudeGenerator, gcConfig);
  }

  if (config.authType === AuthType.USE_AWS_BEDROCK) {
    console.log(`[CONTENT-GEN] ✅ Creating BedrockContentGenerator`);
    const awsRegion = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'];
    const bedrockGenerator = new BedrockContentGenerator(config.model, awsRegion);
    return new LoggingContentGenerator(bedrockGenerator, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
