/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported Claude models via Bedrock for agents
 */
export const SUPPORTED_CLAUDE_MODELS = [
  'claude-4-sonnet',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
] as const;

export type ClaudeModel = typeof SUPPORTED_CLAUDE_MODELS[number];

/**
 * Agent definition loaded from .devx/agents/*.md files
 */
export interface AgentDefinition {
  /** Unique identifier for the agent (kebab-case recommended) */
  name: string;
  /** Description of what the agent does and when to use it */
  description: string;
  /** Optional list of tools this agent can use. If omitted, inherits all allowed tools */
  tools?: string[];
  /** Optional Claude model to use for this agent. If omitted, uses session default */
  model?: ClaudeModel;
  /** The system prompt for this agent (from markdown body) */
  prompt: string;
  /** Optional memory file to include in system prompt */
  memory?: string;
}

/**
 * Agent metadata for the loader
 */
export interface AgentMetadata {
  /** File path where the agent was loaded from */
  filePath: string;
  /** Whether this is from user scope (~/.devx) or workspace scope (.devx) */
  scope: 'user' | 'workspace';
  /** Last modified time for change detection */
  lastModified: number;
}

/**
 * Complete agent information
 */
export interface Agent extends AgentDefinition {
  metadata: AgentMetadata;
}

/**
 * Agent frontmatter schema (YAML)
 */
export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  model?: ClaudeModel;
  memory?: string;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  /** The active agent definition */
  agent: AgentDefinition;
  /** Original session system prompt (to restore when switching back) */
  originalSystemPrompt?: string;
  /** Available tools for this agent (after filtering) */
  availableTools: string[];
}