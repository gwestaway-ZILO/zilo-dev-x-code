/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCurrentGeminiMdFilename, MemoryComposer } from '@google/gemini-cli-core';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates DevX.md files with memory layering support.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const targetDir = context.services.config.getTargetDir();
    const contextFileName = getCurrentGeminiMdFilename();
    const projectMemoryPath = path.join(targetDir, contextFileName);
    
    // Initialize memory composer for user memory support
    const memoryComposer = new MemoryComposer(targetDir);
    const userMemoryPath = memoryComposer.getUserMemoryPath();

    // Parse command arguments to determine scope
    const scope = args.trim().toLowerCase();
    const isUserScope = scope === 'user' || scope === '--user';
    const isProjectScope = scope === 'project' || scope === '--project' || scope === '';

    // Handle user memory initialization
    if (isUserScope) {
      const hasUserMemory = await memoryComposer.hasUserMemory();
      
      if (hasUserMemory) {
        return {
          type: 'message',
          messageType: 'info',
          content: `User memory file already exists at ${userMemoryPath}. No changes were made.\n\nTo view: cat "${userMemoryPath}"\nTo edit: Use your preferred editor to modify the file.\n\nTip: Try '/init project' to initialize project-specific memory.`,
        };
      }

      // Create user memory file
      await memoryComposer.createUserMemoryFile();

      context.ui.addItem(
        {
          type: 'info',
          text: `User memory file created at ${userMemoryPath}. This will apply to all your DevX projects.`,
        },
        Date.now(),
      );

      return {
        type: 'message',
        messageType: 'info',
        content: `✅ User memory file created at ${userMemoryPath}\n\nThis file contains your personal DevX preferences and will be applied to all projects.\n\nNext steps:\n- Edit the file to add your personal coding preferences\n- Use '/init project' to create project-specific memory\n- Memory precedence: Project > User > Global`,
      };
    }

    // Handle project memory initialization
    if (isProjectScope) {
      const existingProjectMemory = fs.existsSync(projectMemoryPath);
      
      if (existingProjectMemory) {
        // Offer options: open, merge, replace, abort
        context.ui.addItem(
          {
            type: 'info',
            text: `Project memory file ${contextFileName} already exists. Choose an option:`,
          },
          Date.now(),
        );

        return {
          type: 'submit_prompt',
          content: `A ${contextFileName} file already exists in this project. Please choose how to proceed:

**OPTIONS:**
- **merge** - Analyze the project and merge new content with existing file
- **replace** - Replace the existing file with fresh analysis  
- **open** - Open the existing file for viewing/editing
- **abort** - Cancel the operation

Please respond with one of: merge, replace, open, or abort`,
        };
      }

      // Create empty project memory file
      fs.writeFileSync(projectMemoryPath, '', 'utf8');

      context.ui.addItem(
        {
          type: 'info',
          text: `Empty ${contextFileName} created. Now analyzing the project to populate it.`,
        },
        Date.now(),
      );

      // Install default agents if this is the first time
      try {
        const agentLoader = context.services.config!.getAgentLoader();
        const installResult = await agentLoader.installDefaultAgentsIfNeeded();
        
        if (installResult.installed && installResult.agents.length > 0) {
          context.ui.addItem(
            {
              type: 'info',
              text: `🤖 Enhanced DevX experience! Installed ${installResult.agents.length} specialized agents:\n${installResult.agents.map(name => `   ✅ ${name}`).join('\n')}\n\n💡 Use '/agent list' to see all agents or '/agent use <name>' to activate one.`,
            },
            Date.now(),
          );
        }
      } catch (error) {
        // Don't fail the init command if agent installation fails
        console.warn('Agent installation failed:', error);
      }

      return {
        type: 'submit_prompt',
        content: `I need you to analyze this project and create a comprehensive ${contextFileName} file. 

**IMPORTANT:** You MUST use the write_file tool to create the file at "${projectMemoryPath}".

Please follow this workflow:
1. First, explore the project structure and key files
2. Then, use the write_file tool to create a complete ${contextFileName}

The file should include these sections:
- Project Overview (what this project does, tech stack, architecture)
- Essential Commands (development, build, testing)
- Architecture (project structure, key components)
- Development Guidelines (code standards, testing strategy)
- Configuration (environment variables, build settings)
- Troubleshooting (common issues)

Start by exploring the project files to understand what this project does.`,
      };
    }

    // Default case - show usage help
    return {
      type: 'message',
      messageType: 'info',
      content: `DevX Memory Initialization - Enhanced with Layering Support

**Usage:**
- \`/init\` or \`/init project\` - Initialize project-specific memory (${contextFileName})
- \`/init user\` - Initialize user-global memory (~/.devx/DEVX.md)

**Memory Layering (precedence: highest to lowest):**
1. **Agent Memory** - Active agent's memory (if any)
2. **Project Memory** - ${contextFileName} (project-specific)
3. **User Memory** - ~/.devx/DEVX.md (applies to all projects)
4. **Global Memory** - ~/.gemini/DevX.md (backward compatibility)

**Import Support:**
Memory files can import other files using @import syntax:
- \`@./relative/path.md\` - Relative to current file
- \`@~/.devx/shared/file.md\` - User DevX directory
- \`@/absolute/path.md\` - Absolute path

**Examples:**
- \`/init\` - Analyze this project and create ${contextFileName}
- \`/init user\` - Create ~/.devx/DEVX.md for personal preferences
- \`/init project\` - Same as \`/init\` (explicit)

Try one of these commands to get started!`,
    };
  },
};
