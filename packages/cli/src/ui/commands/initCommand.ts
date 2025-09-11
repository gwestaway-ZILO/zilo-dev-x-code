/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCurrentGeminiMdFilename } from '@google/gemini-cli-core';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored DevX.md file.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
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
    const geminiMdPath = path.join(targetDir, contextFileName);

    if (fs.existsSync(geminiMdPath)) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          `A ${contextFileName} file already exists in this directory. No changes were made.`,
      };
    }

    // Create an empty DevX.md file
    fs.writeFileSync(geminiMdPath, '', 'utf8');

    context.ui.addItem(
      {
        type: 'info',
        text: `Empty ${contextFileName} created. Now analyzing the project to populate it.`,
      },
      Date.now(),
    );

    return {
      type: 'submit_prompt',
      content: `
**🚨 MANDATORY TOOL USAGE REQUIRED 🚨**

You MUST complete this task by using the write_file tool. This is NOT optional.

**REQUIRED ACTION:** You must analyze this project and then call the write_file tool exactly like this:

\`\`\`
write_file({
  "file_path": "${geminiMdPath}",
  "content": "# ${contextFileName}\\n\\n## Project Overview\\n[Your analysis here]\\n\\n## Essential Commands\\n[Commands here]\\n..."
})
\`\`\`

**❌ DO NOT:** Simply describe what you would write or explain the analysis in text
**✅ DO:** Actually use the write_file tool to create the file content

You are analyzing the current directory to generate a comprehensive ${contextFileName} file for future AI interactions.

**WORKFLOW - ANALYSIS THEN TOOL USAGE:**

1. First: Analyze the project (use tools to explore files)
2. Then: IMMEDIATELY use write_file tool with your findings

**Analysis Process:**

1.  **Initial Exploration:**
    *   Start by listing the files and directories to get a high-level overview of the structure.
    *   Read the README file (e.g., \`README.md\`, \`README.txt\`) if it exists. This is often the best place to start.
    *   Check for configuration files (\`package.json\`, \`tsconfig.json\`, \`.eslintrc\`, etc.) to understand the tech stack.

2.  **Iterative Deep Dive (up to 10 files):**
    *   Based on your initial findings, select files that reveal the most about the project:
        - Configuration files (package.json, tsconfig.json, vite.config.js, etc.)
        - Main entry points (index.ts, main.py, app.js, etc.)
        - Test files to understand testing patterns
        - CI/CD configurations (.github/workflows, .gitlab-ci.yml)
        - Build configurations (Makefile, webpack.config.js, etc.)
    *   Let your discoveries guide your exploration - adapt based on what you find.

3.  **Identify Project Characteristics:**
    *   **Language & Framework:** TypeScript/JavaScript, Python, Go, Java, etc.
    *   **Project Type:** Web app, CLI tool, library, API service, etc.
    *   **Architecture:** Monorepo, microservices, single package, etc.
    *   **Testing Framework:** Jest, Vitest, Pytest, Go test, etc.
    *   **Build Tools:** Webpack, Vite, Rollup, Make, Gradle, etc.

**${contextFileName} Content Generation:**

Generate a comprehensive guide with the following structure:

# ${contextFileName}

## Project Overview
- Clear, concise summary of what this project does
- Main technologies and frameworks used
- High-level architecture description
- Key dependencies and their purposes

## Essential Commands

### Development
- Commands to start development mode
- Hot reload/watch mode commands
- Local environment setup

### Build & Deployment  
- Build commands for production
- Deployment procedures
- Environment-specific builds

### Testing & Quality
- Unit test commands
- Integration/E2E test commands
- Linting and formatting commands
- Type checking commands
- Coverage reports

## Architecture

### Project Structure
- Describe the directory layout
- Explain the purpose of key directories
- Note any unconventional structures

### Key Components
- List and describe main modules/packages
- Explain their relationships and dependencies
- Highlight important files and their roles

### Design Patterns
- Architectural patterns used (MVC, microservices, etc.)
- Code organization principles
- State management approach (if applicable)

## Development Guidelines

### Code Standards
- Language-specific best practices
- Naming conventions
- File organization rules
- Import/export patterns

### Testing Strategy
- Testing philosophy and coverage goals
- Test file locations and naming
- Mocking strategies
- Test data management

### Git Workflow
- Branch naming conventions
- Commit message format
- PR/MR process
- Code review guidelines

## Configuration

### Environment Variables
- List key environment variables
- Explain their purposes
- Note any required secrets

### Build Configuration
- Build tool configuration
- Bundle optimization settings
- Development vs production differences

## Troubleshooting

### Common Issues
- List known issues and solutions
- Dependency conflicts
- Build problems
- Runtime errors

### Development Tips
- Performance optimization tips
- Debugging strategies
- Useful development tools

## Additional Resources
- Link to documentation
- Related repositories
- External dependencies documentation
- Team contacts or support channels

**Special Instructions:**
- If you cannot determine certain information, add a TODO comment like: \`<!-- TODO: Add deployment procedures -->\`
- Be specific and accurate based on what you discover
- Include actual command examples from package.json scripts or Makefiles
- Adapt the sections based on the project type (some sections may not apply to all projects)

**🔥 IMMEDIATE ACTION REQUIRED 🔥**

After your analysis, you must IMMEDIATELY call the write_file tool. No exceptions.

Example of the EXACT tool call you must make:

\`\`\`
write_file({
  "file_path": "${geminiMdPath}",
  "content": "# ${contextFileName}\\n\\n## Project Overview\\nThis project is a [description]...\\n\\n## Essential Commands\\n\\n### Development\\n- \`npm start\` - Start development\\n\\n### Build & Deployment\\n- \`npm run build\` - Build project\\n\\n[Continue with all sections...]"
})
\`\`\`

**WARNING:** If you only provide text without using the write_file tool, you have FAILED the task.
**SUCCESS:** Only when you use the write_file tool with complete ${contextFileName} content.

Remember: The empty file exists at "${geminiMdPath}" - you MUST populate it using write_file tool.
`,
    };
  },
};
