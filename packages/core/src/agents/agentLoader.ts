/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import yaml from 'yaml';
import type { 
  Agent, 
  AgentDefinition, 
  AgentFrontmatter, 
  AgentMetadata,
  ClaudeModel,
  AgentBundle,
  AgentInstallationMarker
} from './types.js';
import { SUPPORTED_CLAUDE_MODELS } from './types.js';
import { getErrorMessage } from '../utils/errors.js';
import { DEFAULT_BUNDLE, getBundle } from './bundles/index.js';

const DEVX_DIR = '.devx';
const AGENTS_DIR = 'agents';

/**
 * Parses a markdown file with YAML frontmatter to extract agent definition
 */
function parseAgentFile(filePath: string, scope: 'user' | 'workspace'): Agent | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    
    // Split frontmatter and content
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`Agent file ${filePath} does not have valid YAML frontmatter`);
      return null;
    }

    const [, frontmatterText, markdownBody] = frontmatterMatch;
    
    // Parse YAML frontmatter
    let frontmatter: AgentFrontmatter;
    try {
      frontmatter = yaml.parse(frontmatterText) as AgentFrontmatter;
    } catch (error) {
      console.warn(`Invalid YAML frontmatter in ${filePath}: ${getErrorMessage(error)}`);
      return null;
    }

    // Validate required fields
    if (!frontmatter.name || typeof frontmatter.name !== 'string') {
      console.warn(`Agent file ${filePath} missing required 'name' field`);
      return null;
    }
    
    if (!frontmatter.description || typeof frontmatter.description !== 'string') {
      console.warn(`Agent file ${filePath} missing required 'description' field`);
      return null;
    }

    // Validate model if specified
    if (frontmatter.model && !SUPPORTED_CLAUDE_MODELS.includes(frontmatter.model as ClaudeModel)) {
      console.warn(`Agent file ${filePath} has unsupported model: ${frontmatter.model}`);
      return null;
    }

    // Validate tools if specified
    if (frontmatter.tools && (!Array.isArray(frontmatter.tools) || !frontmatter.tools.every(t => typeof t === 'string'))) {
      console.warn(`Agent file ${filePath} has invalid 'tools' field - must be array of strings`);
      return null;
    }

    const metadata: AgentMetadata = {
      filePath,
      scope,
      lastModified: stats.mtimeMs,
    };

    const agent: Agent = {
      name: frontmatter.name,
      description: frontmatter.description,
      tools: frontmatter.tools,
      model: frontmatter.model,
      memory: frontmatter.memory,
      prompt: markdownBody.trim(),
      metadata,
    };

    return agent;
  } catch (error) {
    console.warn(`Error parsing agent file ${filePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * Gets the user agents directory path
 */
function getUserAgentsDir(): string {
  return path.join(homedir(), DEVX_DIR, AGENTS_DIR);
}

/**
 * Gets the workspace agents directory path
 */
function getWorkspaceAgentsDir(workspaceRoot?: string): string {
  const root = workspaceRoot || process.cwd();
  return path.join(root, DEVX_DIR, AGENTS_DIR);
}

/**
 * Loads agents from a directory
 */
function loadAgentsFromDir(agentsDir: string, scope: 'user' | 'workspace'): Agent[] {
  const agents: Agent[] = [];
  
  try {
    if (!fs.existsSync(agentsDir)) {
      return agents;
    }

    const files = fs.readdirSync(agentsDir);
    for (const file of files) {
      if (!file.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(agentsDir, file);
      const agent = parseAgentFile(filePath, scope);
      if (agent) {
        agents.push(agent);
      }
    }
  } catch (error) {
    console.warn(`Error loading agents from ${agentsDir}: ${getErrorMessage(error)}`);
  }

  return agents;
}

/**
 * Agent loader class that manages loading and caching of agent definitions
 */
export class AgentLoader {
  private cachedAgents: Map<string, Agent> = new Map();
  private lastLoadTime = 0;
  private workspaceRoot?: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Loads all agents from user and workspace directories
   * Workspace agents take precedence over user agents with the same name
   */
  loadAgents(): Map<string, Agent> {
    const now = Date.now();
    
    // Only reload if it's been more than 1 second since last load
    // This prevents excessive file system access while allowing hot reloading
    if (now - this.lastLoadTime < 1000 && this.cachedAgents.size > 0) {
      return this.cachedAgents;
    }

    const agents = new Map<string, Agent>();
    
    // Load user agents first
    const userAgents = loadAgentsFromDir(getUserAgentsDir(), 'user');
    for (const agent of userAgents) {
      agents.set(agent.name, agent);
    }

    // Load workspace agents second (they override user agents)
    const workspaceAgents = loadAgentsFromDir(getWorkspaceAgentsDir(this.workspaceRoot), 'workspace');
    for (const agent of workspaceAgents) {
      agents.set(agent.name, agent);
    }

    this.cachedAgents = agents;
    this.lastLoadTime = now;
    
    return agents;
  }

  /**
   * Gets a specific agent by name
   */
  getAgent(name: string): Agent | undefined {
    const agents = this.loadAgents();
    return agents.get(name);
  }

  /**
   * Gets all available agent names
   */
  getAgentNames(): string[] {
    const agents = this.loadAgents();
    return Array.from(agents.keys()).sort();
  }

  /**
   * Forces a reload of all agents from disk
   */
  forceReload(): Map<string, Agent> {
    this.lastLoadTime = 0;
    this.cachedAgents.clear();
    return this.loadAgents();
  }

  /**
   * Creates the agents directory if it doesn't exist
   */
  ensureAgentsDirectory(scope: 'user' | 'workspace'): string {
    const agentsDir = scope === 'user' 
      ? getUserAgentsDir() 
      : getWorkspaceAgentsDir(this.workspaceRoot);
    
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    
    return agentsDir;
  }

  /**
   * Creates a new agent file
   */
  createAgent(agent: AgentDefinition, scope: 'user' | 'workspace' = 'workspace'): string {
    const agentsDir = this.ensureAgentsDirectory(scope);
    const fileName = `${agent.name}.md`;
    const filePath = path.join(agentsDir, fileName);

    if (fs.existsSync(filePath)) {
      throw new Error(`Agent ${agent.name} already exists at ${filePath}`);
    }

    const frontmatter: AgentFrontmatter = {
      name: agent.name,
      description: agent.description,
      ...(agent.tools && { tools: agent.tools }),
      ...(agent.model && { model: agent.model }),
      ...(agent.memory && { memory: agent.memory }),
    };

    const content = `---
${yaml.stringify(frontmatter)}---
${agent.prompt}
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    
    // Force reload to pick up the new agent
    this.forceReload();
    
    return filePath;
  }

  /**
   * Deletes an agent file
   */
  deleteAgent(name: string): boolean {
    const agent = this.getAgent(name);
    if (!agent) {
      return false;
    }

    try {
      fs.unlinkSync(agent.metadata.filePath);
      this.forceReload();
      return true;
    } catch (error) {
      console.warn(`Error deleting agent ${name}: ${getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Check if this is the first time agents are being installed
   */
  isFirstTimeInstallation(): boolean {
    const workspaceAgentsDir = getWorkspaceAgentsDir(this.workspaceRoot);
    const markerPath = path.join(workspaceAgentsDir, '.installation-marker');
    return !fs.existsSync(markerPath);
  }

  /**
   * Mark agents as installed to prevent future auto-installation
   */
  markInstallationComplete(bundleName: string, installedAgents: string[]): void {
    const workspaceAgentsDir = this.ensureAgentsDirectory('workspace');
    const markerPath = path.join(workspaceAgentsDir, '.installation-marker');
    
    const marker: AgentInstallationMarker = {
      installedAt: new Date().toISOString(),
      bundleVersion: DEFAULT_BUNDLE.version,
      installedAgents
    };

    try {
      fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`Error creating installation marker: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Install agents from a bundle
   */
  async installBundle(bundle: AgentBundle, scope: 'user' | 'workspace' = 'workspace'): Promise<string[]> {
    const agentsDir = this.ensureAgentsDirectory(scope);
    const installedAgents: string[] = [];

    for (const agentDef of bundle.agents) {
      try {
        const fileName = `${agentDef.name}.md`;
        const filePath = path.join(agentsDir, fileName);
        
        // Skip if agent already exists
        if (fs.existsSync(filePath)) {
          console.log(`Agent ${agentDef.name} already exists, skipping...`);
          continue;
        }

        // Create agent frontmatter
        const frontmatter: AgentFrontmatter = {
          name: agentDef.name,
          description: agentDef.description,
          ...(agentDef.tools && { tools: agentDef.tools }),
          ...(agentDef.model && { model: agentDef.model }),
          ...(agentDef.memory && { memory: agentDef.memory }),
        };

        // Create agent file content
        const content = `---
${yaml.stringify(frontmatter)}---
${agentDef.prompt}
`;

        fs.writeFileSync(filePath, content, 'utf-8');
        installedAgents.push(agentDef.name);
      } catch (error) {
        console.warn(`Error installing agent ${agentDef.name}: ${getErrorMessage(error)}`);
      }
    }

    // Force reload to pick up new agents
    this.forceReload();
    
    return installedAgents;
  }

  /**
   * Install default agents if this is the first time
   */
  async installDefaultAgentsIfNeeded(): Promise<{ installed: boolean; agents: string[] }> {
    if (!this.isFirstTimeInstallation()) {
      return { installed: false, agents: [] };
    }

    try {
      const installedAgents = await this.installBundle(DEFAULT_BUNDLE, 'workspace');
      this.markInstallationComplete(DEFAULT_BUNDLE.name, installedAgents);
      
      return { installed: true, agents: installedAgents };
    } catch (error) {
      console.warn(`Error installing default agents: ${getErrorMessage(error)}`);
      return { installed: false, agents: [] };
    }
  }

  /**
   * Get available built-in bundles
   */
  getAvailableBundle(name: string): AgentBundle | undefined {
    return getBundle(name);
  }
}