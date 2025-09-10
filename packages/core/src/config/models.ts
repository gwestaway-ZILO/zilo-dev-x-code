/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Claude models
export const DEFAULT_CLAUDE_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
export const CLAUDE_OPUS_MODEL = 'claude-3-opus-20240229';
export const CLAUDE_HAIKU_MODEL = 'claude-3-5-haiku-20241022';

// Bedrock Claude models (user-friendly names that map to inference profiles)
export const BEDROCK_CLAUDE_4_SONNET = 'claude-4-sonnet';
export const BEDROCK_CLAUDE_3_5_SONNET = 'claude-3-5-sonnet';
export const BEDROCK_CLAUDE_3_5_HAIKU = 'claude-3-5-haiku';
export const BEDROCK_CLAUDE_3_OPUS = 'claude-3-opus';
export const BEDROCK_CLAUDE_3_SONNET = 'claude-3-sonnet';
export const BEDROCK_CLAUDE_3_HAIKU = 'claude-3-haiku';
export const DEFAULT_BEDROCK_MODEL = BEDROCK_CLAUDE_4_SONNET; // Use Claude 4 Sonnet as default

// Some thinking models do not default to dynamic thinking which is done by a value of -1
export const DEFAULT_THINKING_MODE = -1;
