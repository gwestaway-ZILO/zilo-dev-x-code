/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Config } from '../config/config.js';
import type { Subtask, Changeset } from './orchestrator.js';
import { FileScopeService } from './fileScope.js';
// CoreToolScheduler removed as it's not directly used in this implementation
import { MemoryComposer } from '../config/memory.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Result of executing a subtask
 */
export interface SubtaskResult {
  /** The subtask that was executed */
  subtaskId: string;
  /** Success status */
  success: boolean;
  /** Agent that was used */
  agentUsed: string;
  /** Model that was used */
  modelUsed: string;
  /** Generated output/response from the agent */
  output: string;
  /** Files that were modified during execution */
  changeset: Changeset;
  /** Duration of execution in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Path to subtask artifacts */
  artifactsPath: string;
}

/**
 * Configuration for subtask execution
 */
export interface SubtaskExecutionConfig {
  /** Base directory for file operations */
  baseDir: string;
  /** Global file scope restrictions */
  globalFileScope: string[];
  /** Timeout in milliseconds */
  timeout: number;
  /** Directory to store artifacts */
  artifactsDir: string;
}

/**
 * Service for executing individual subtasks with proper isolation
 */
export class SubtaskRunner {
  private readonly config: Config;
  private readonly memoryComposer: MemoryComposer;

  constructor(config: Config) {
    this.config = config;
    this.memoryComposer = new MemoryComposer(config.getTargetDir());
  }

  /**
   * Execute a single subtask with proper isolation and monitoring
   */
  async runSubtask(
    subtask: Subtask,
    executionConfig: SubtaskExecutionConfig
  ): Promise<SubtaskResult> {
    const startTime = Date.now();
    const subtaskArtifactsDir = path.join(executionConfig.artifactsDir, subtask.id);
    await fs.mkdir(subtaskArtifactsDir, { recursive: true });

    // Initialize changeset tracking
    const changeset: Changeset = {
      touchedFiles: [],
      notes: [],
      testCommands: [],
      relatedFiles: [],
    };

    try {
      // 1. Resolve agent to use
      const agentUsed = await this.resolveAgent(subtask);
      
      // 2. Resolve model to use
      const modelUsed = this.resolveModel(subtask, agentUsed);

      // 3. Set up file scope restrictions
      const fileScope = this.createFileScope(subtask, executionConfig);

      // 4. Create isolated session with proper context
      const sessionContext = await this.createSessionContext(
        subtask,
        agentUsed,
        fileScope,
        executionConfig.baseDir
      );

      // 5. Execute the subtask
      const output = await this.executeWithTimeout(
        sessionContext,
        modelUsed,
        fileScope,
        changeset,
        executionConfig.timeout
      );

      // 6. Save execution artifacts
      await this.saveSubtaskArtifacts(subtaskArtifactsDir, {
        subtask,
        agentUsed,
        modelUsed,
        output,
        changeset,
        fileScope: fileScope.getScopeSummary(),
      });

      const duration = Date.now() - startTime;

      return {
        subtaskId: subtask.id,
        success: true,
        agentUsed,
        modelUsed,
        output,
        changeset,
        duration,
        artifactsPath: subtaskArtifactsDir,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);

      // Save error artifacts
      await this.saveSubtaskArtifacts(subtaskArtifactsDir, {
        subtask,
        error: errorMessage,
        changeset,
      });

      return {
        subtaskId: subtask.id,
        success: false,
        agentUsed: 'unknown',
        modelUsed: 'unknown',
        output: '',
        changeset,
        duration,
        error: errorMessage,
        artifactsPath: subtaskArtifactsDir,
      };
    }
  }

  /**
   * Resolve which agent to use for the subtask
   */
  private async resolveAgent(subtask: Subtask): Promise<string> {
    const agentLoader = this.config.getAgentLoader();
    const availableAgents = agentLoader.loadAgents();

    // Use suggested agent if available
    if (subtask.suggestedAgent && availableAgents.has(subtask.suggestedAgent)) {
      return subtask.suggestedAgent;
    }

    // Fall back to current active agent
    const currentAgent = this.config.getCurrentAgent();
    if (currentAgent) {
      return currentAgent.name;
    }

    // Default to a general-purpose agent if available
    const defaultAgents = ['general-assistant', 'code-assistant', 'default'];
    for (const agentName of defaultAgents) {
      if (availableAgents.has(agentName)) {
        return agentName;
      }
    }

    // Use the first available agent
    const firstAgent = availableAgents.keys().next().value;
    if (firstAgent) {
      return firstAgent;
    }

    // No agents available - will use base configuration
    return 'base';
  }

  /**
   * Resolve which model to use for the subtask
   */
  private resolveModel(subtask: Subtask, agentUsed: string): string {
    // Use subtask-specified model if provided
    if (subtask.model) {
      return subtask.model;
    }

    // Check if agent has a preferred model
    const agentLoader = this.config.getAgentLoader();
    const agent = agentLoader.loadAgents().get(agentUsed);
    if (agent?.model) {
      return agent.model;
    }

    // Use current configuration model
    const currentModel = this.config.getModel();
    if (currentModel) {
      return currentModel;
    }

    // Default to Claude 3.5 Sonnet for balanced performance/cost
    return 'claude-3-5-sonnet';
  }

  /**
   * Create file scope service with combined restrictions
   */
  private createFileScope(
    subtask: Subtask,
    executionConfig: SubtaskExecutionConfig
  ): FileScopeService {
    const globalScope = executionConfig.globalFileScope;
    const subtaskScope = subtask.fileGlobs || [];
    
    // Combine global and subtask scopes
    const combinedGlobs = [...globalScope, ...subtaskScope];
    
    return FileScopeService.fromGlobs(combinedGlobs, executionConfig.baseDir);
  }

  /**
   * Create session context with proper memory and agent configuration
   */
  private async createSessionContext(
    subtask: Subtask,
    agentUsed: string,
    fileScope: FileScopeService,
    baseDir: string
  ): Promise<{
    systemPrompt: string;
    userMessage: string;
    toolAllowlist: string[];
  }> {
    // Load agent configuration
    const agentLoader = this.config.getAgentLoader();
    const agent = agentLoader.loadAgents().get(agentUsed);
    
    // Compose memory with agent memory
    const composedMemory = await this.memoryComposer.composeMemory(agent?.memory);
    
    // Build system prompt
    const systemPromptParts = [];
    
    // Add agent system prompt if available
    if (agent?.prompt) {
      systemPromptParts.push(agent.prompt);
    }
    
    // Add memory content
    if (composedMemory.content) {
      systemPromptParts.push('\n## Project Context\n');
      systemPromptParts.push(composedMemory.content);
    }
    
    // Add subtask-specific context
    systemPromptParts.push(`\n## Current Subtask Context
You are working on a specific subtask as part of a larger delegated task execution.

**Subtask Goal**: ${subtask.goal}
**File Scope**: ${fileScope.getScopeSummary()}
**Working Directory**: ${baseDir}

**Important Guidelines**:
- Focus exclusively on the subtask goal
- Only modify files within your allowed scope
- Prefer small, safe edits over large changes
- Document any follow-up actions needed
- If you cannot complete the task due to scope restrictions, explain what's needed`);

    const systemPrompt = systemPromptParts.join('\n');

    // Build user message
    const userMessage = `Execute the following subtask:

**Goal**: ${subtask.goal}

**Instructions**:
1. Analyze what needs to be done to achieve the goal
2. Use available tools to make necessary changes
3. Stay within the allowed file scope: ${fileScope.getScopeSummary()}
4. Prefer minimal, focused changes
5. After completing changes, provide a brief summary of what was accomplished
6. List any test commands that should be run to verify the changes

Begin execution now.`;

    // Determine tool allowlist
    const toolAllowlist = this.determineToolAllowlist(subtask, agent);

    return {
      systemPrompt,
      userMessage,
      toolAllowlist,
    };
  }

  /**
   * Determine which tools the subtask is allowed to use
   */
  private determineToolAllowlist(
    subtask: Subtask,
    agent: { tools?: string[] } | undefined
  ): string[] {
    // Start with subtask-specific tools if provided
    if (subtask.tools && subtask.tools.length > 0) {
      return subtask.tools;
    }

    // Use agent tools if available
    if (agent?.tools && agent.tools.length > 0) {
      return agent.tools;
    }

    // Default to safe tools for file operations and analysis
    return [
      'read_file',
      'write_file',
      'smart_edit',
      'ls',
      'glob',
      'rip_grep',
      'shell', // Included but will be scope-limited
    ];
  }

  /**
   * Execute the subtask with timeout and proper tool isolation
   */
  private async executeWithTimeout(
    sessionContext: {
      systemPrompt: string;
      userMessage: string;
      toolAllowlist: string[];
    },
    modelUsed: string,
    fileScope: FileScopeService,
    changeset: Changeset,
    timeout: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Subtask execution timed out after ${timeout}ms`));
      }, timeout);

      this.executeSubtaskSession(sessionContext, modelUsed, fileScope, changeset)
        .then(result => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  /**
   * Execute the actual subtask session
   */
  private async executeSubtaskSession(
    sessionContext: {
      systemPrompt: string;
      userMessage: string;
      toolAllowlist: string[];
    },
    modelUsed: string,
    fileScope: FileScopeService,
    changeset: Changeset
  ): Promise<string> {
    // For now, provide explicit instructions for the agent to implement the task
    // This is a simplified approach until we can properly integrate with the turn system
    
    const enhancedUserMessage = `${sessionContext.userMessage}

IMPORTANT LIMITATION: This delegation system is currently in development. You cannot directly execute tools or create files. 

Instead, please provide:
1. The exact file paths that should be created
2. The complete code content for each file
3. Clear instructions for implementing the task

Format your response like this:

FILE: path/to/file.test.ts
\`\`\`typescript
// Complete file content here
\`\`\`

FILE: path/to/another-file.test.ts
\`\`\`typescript
// Complete file content here
\`\`\`

INSTRUCTIONS:
- List of steps to implement the task
- Any additional setup needed

Please provide the detailed implementation plan now.`;

    // Create content generator for the specified model
    const contentGenerator = this.config.getContentGenerator();

    // Execute the conversation with enhanced instructions
    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: enhancedUserMessage }],
      },
    ];

    const response = await contentGenerator.generateContent({
      model: modelUsed,
      contents,
    }, 'subtask-execution');

    // Extract response text
    const candidate = response.candidates?.[0];
    const responseText = candidate?.content?.parts
      ?.filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join('\n') || '';

    // Parse agent response and execute file creation commands
    await this.parseAndExecuteCommands(responseText, fileScope, changeset);

    return responseText;
  }

  /**
   * Parse agent response and execute file creation commands
   */
  private async parseAndExecuteCommands(
    responseText: string, 
    fileScope: FileScopeService,
    changeset: Changeset
  ): Promise<void> {
    if (!responseText) return;

    // Extract file_editor commands from agent response
    const fileEditorMatches = responseText.matchAll(/<file_editor>\s*<path>(.*?)<\/path>\s*<file_text>(.*?)<\/file_text>\s*<\/file_editor>/gs);
    
    for (const match of fileEditorMatches) {
      const filePath = match[1].trim();
      const fileContent = match[2].trim();
      
      try {
        // Check if file is allowed by scope
        const scopeResult = fileScope.isPathAllowed(filePath);
        if (!scopeResult.allowed) {
          console.warn(`File creation denied: ${scopeResult.reason} (${filePath})`);
          continue;
        }

        // Create directories if needed
        const dirPath = path.dirname(filePath);
        await fs.mkdir(dirPath, { recursive: true });
        
        // Write the file
        await fs.writeFile(filePath, fileContent, 'utf-8');
        
        // Track in changeset
        if (!changeset.touchedFiles.includes(filePath)) {
          changeset.touchedFiles.push(filePath);
        }
        
        console.log(`Created file: ${filePath}`);
        
      } catch (error) {
        console.error(`Failed to create file ${filePath}:`, getErrorMessage(error));
      }
    }

    // Also look for FILE: format from our instructions
    const fileBlockMatches = responseText.matchAll(/FILE:\s*(.+?)\n\s*```(?:typescript|javascript|json|jsx|tsx)?\n(.*?)\n```/gs);
    
    for (const match of fileBlockMatches) {
      const filePath = match[1].trim();
      const fileContent = match[2].trim();
      
      try {
        // Check if file is allowed by scope
        const scopeResult = fileScope.isPathAllowed(filePath);
        if (!scopeResult.allowed) {
          console.warn(`File creation denied: ${scopeResult.reason} (${filePath})`);
          continue;
        }

        // Create directories if needed
        const dirPath = path.dirname(filePath);
        await fs.mkdir(dirPath, { recursive: true });
        
        // Write the file
        await fs.writeFile(filePath, fileContent, 'utf-8');
        
        // Track in changeset
        if (!changeset.touchedFiles.includes(filePath)) {
          changeset.touchedFiles.push(filePath);
        }
        
        console.log(`Created file: ${filePath}`);
        
      } catch (error) {
        console.error(`Failed to create file ${filePath}:`, getErrorMessage(error));
      }
    }
  }

  /**
   * Create a scoped tool registry that applies file restrictions
   * TODO: Re-enable when proper tool integration is implemented
   */
  /*
  private createScopedToolRegistry(
    fileScope: FileScopeService,
    changeset: Changeset
  ): any {
    const originalRegistry = this.config.getToolRegistry();
    
    // Create a wrapper class that extends the original registry behavior
    class ScopedToolRegistry {
      private originalRegistry: any;
      private fileScope: FileScopeService;
      private changeset: Changeset;

      constructor(originalRegistry: any, fileScope: FileScopeService, changeset: Changeset) {
        this.originalRegistry = originalRegistry;
        this.fileScope = fileScope;
        this.changeset = changeset;
      }

      // Delegate all methods to the original registry
      getAllTools(): any[] {
        const originalTools = this.originalRegistry.getAllTools();
        // Wrap tools to add file scope checking
        return originalTools.map((tool: any) => this.wrapToolWithScope(tool));
      }

      getToolsByServer(serverName: string): any[] {
        const originalTools = this.originalRegistry.getToolsByServer(serverName);
        return originalTools.map((tool: any) => this.wrapToolWithScope(tool));
      }

      registerTool(tool: any) {
        return this.originalRegistry.registerTool(tool);
      }

      discoverAllTools() {
        return this.originalRegistry.discoverAllTools();
      }

      // Delegate other methods as needed
      removeMcpToolsByServer(serverName: string) {
        return this.originalRegistry.removeMcpToolsByServer(serverName);
      }

      discoverMcpTools() {
        return this.originalRegistry.discoverMcpTools();
      }

      restartMcpServers() {
        return this.originalRegistry.restartMcpServers();
      }

      discoverToolsForServer(serverName: string) {
        return this.originalRegistry.discoverToolsForServer(serverName);
      }

      private wrapToolWithScope(tool: any) {
        const self = this;
        
        // Create a wrapped tool that applies file scope restrictions
        return {
          ...tool,
          build: (params: any) => {
            const originalInvocation = tool.build(params);
            
            // Return wrapped invocation
            return {
              ...originalInvocation,
              execute: async (signal: AbortSignal, updateOutput?: (output: string) => void) => {
                // Apply file scope check before execution
                self.applyFileScopeToTool(tool.name, params, self.fileScope);
                
                // Execute the original tool
                const result = await originalInvocation.execute(signal, updateOutput);
                
                // Track file changes
                self.trackFileChanges(tool.name, params, result, self.changeset);
                
                return result;
              }
            };
          }
        };
      }

      private applyFileScopeToTool(
        toolName: string,
        params: any,
        fileScope: FileScopeService
      ): void {
        // File system tools that need scope checking
        const fsTools = ['read_file', 'write_file', 'smart_edit', 'ls', 'glob'];
        
        if (!fsTools.includes(toolName)) {
          return; // Allow non-filesystem tools
        }

        // Extract file path from parameters
        let filePath: string | undefined;
        if (params.path) filePath = params.path;
        if (params.file_path) filePath = params.file_path;
        if (params.directory) filePath = params.directory;

        if (!filePath) {
          return; // Allow if no path specified
        }

        // Check if path is allowed
        const scopeResult = fileScope.isPathAllowed(filePath);
        if (!scopeResult.allowed) {
          throw new Error(`File access denied: ${scopeResult.reason} (${filePath})`);
        }
      }

      private trackFileChanges(
        toolName: string,
        params: any,
        result: any,
        changeset: Changeset
      ): void {
        // Track write operations
        if (toolName === 'write_file' || toolName === 'smart_edit') {
          const filePath = params.path || params.file_path;
          if (filePath && !changeset.touchedFiles.includes(filePath)) {
            changeset.touchedFiles.push(filePath);
          }
        }

        // Extract notes from shell command results
        if (toolName === 'shell' && params.description) {
          if (!changeset.notes) changeset.notes = [];
          if (!changeset.notes.includes(params.description)) {
            changeset.notes.push(params.description);
          }
        }

        // Track test commands
        if (toolName === 'shell' && params.command) {
          const cmd = params.command;
          if (cmd.includes('test') || cmd.includes('spec') || cmd.includes('jest') || cmd.includes('vitest')) {
            if (!changeset.testCommands) changeset.testCommands = [];
            if (!changeset.testCommands.includes(cmd)) {
              changeset.testCommands.push(cmd);
            }
          }
        }
      }
    }

    return new ScopedToolRegistry(originalRegistry, fileScope, changeset);
  }

  private createScopedConfig(scopedToolRegistry: any): any {
    const originalConfig = this.config;
    
    // Create a proxy that intercepts getToolRegistry calls
    return new Proxy(originalConfig, {
      get(target, prop) {
        if (prop === 'getToolRegistry') {
          return () => scopedToolRegistry;
        }
        return (target as any)[prop];
      }
    });
  }
  */


  /**
   * Save subtask execution artifacts
   */
  private async saveSubtaskArtifacts(
    artifactsDir: string,
    data: {
      subtask: Subtask;
      agentUsed?: string;
      modelUsed?: string;
      output?: string;
      changeset: Changeset;
      fileScope?: string;
      error?: string;
    }
  ): Promise<void> {
    // Save detailed execution log
    const executionLog = {
      timestamp: new Date().toISOString(),
      subtask: data.subtask,
      agentUsed: data.agentUsed,
      modelUsed: data.modelUsed,
      fileScope: data.fileScope,
      output: data.output,
      changeset: data.changeset,
      error: data.error,
    };

    await fs.writeFile(
      path.join(artifactsDir, 'execution.json'),
      JSON.stringify(executionLog, null, 2)
    );

    // Save changeset separately for easy access
    await fs.writeFile(
      path.join(artifactsDir, 'changes.json'),
      JSON.stringify(data.changeset, null, 2)
    );

    // Save human-readable summary
    const summary = this.generateSubtaskSummary(data);
    await fs.writeFile(
      path.join(artifactsDir, 'summary.md'),
      summary
    );
  }

  /**
   * Generate human-readable summary of subtask execution
   */
  private generateSubtaskSummary(data: {
    subtask: Subtask;
    agentUsed?: string;
    modelUsed?: string;
    output?: string;
    changeset: Changeset;
    fileScope?: string;
    error?: string;
  }): string {
    const { subtask, agentUsed, modelUsed, output, changeset, fileScope, error } = data;
    
    let summary = `# Subtask: ${subtask.goal}

**ID**: ${subtask.id}
**Agent**: ${agentUsed || 'unknown'}
**Model**: ${modelUsed || 'unknown'}
**File Scope**: ${fileScope || 'unrestricted'}
**Status**: ${error ? 'FAILED' : 'COMPLETED'}

`;

    if (error) {
      summary += `## Error
\`\`\`
${error}
\`\`\`

`;
    }

    if (output) {
      summary += `## Output
${output}

`;
    }

    if (changeset.touchedFiles.length > 0) {
      summary += `## Files Modified
${changeset.touchedFiles.map(file => `- ${file}`).join('\n')}

`;
    }

    if (changeset.notes && changeset.notes.length > 0) {
      summary += `## Notes
${changeset.notes.map(note => `- ${note}`).join('\n')}

`;
    }

    if (changeset.testCommands && changeset.testCommands.length > 0) {
      summary += `## Test Commands
${changeset.testCommands.map(cmd => `\`${cmd}\``).join('\n')}

`;
    }

    return summary;
  }
}