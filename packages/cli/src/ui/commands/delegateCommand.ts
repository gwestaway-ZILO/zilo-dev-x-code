/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { getErrorMessage } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { Orchestrator, type PlanningStrategy, type ExecutionReport } from '@google/gemini-cli-core';

/**
 * Parse delegate command arguments
 */
interface DelegateArgs {
  task: string;
  agents: number;
  strategy: PlanningStrategy;
  globs: string[];
  model?: string;
  maxParallel?: number;
  timeout?: number;
  continueOnFailure?: boolean;
}

/**
 * Parse command line arguments for delegate command
 */
function parseDelegateArgs(args: string): DelegateArgs {
  // Simple argument parsing - in a real implementation, you might want to use a proper CLI parser
  const parts = args.trim().split(/\s+/);
  
  let task = '';
  let agents = 3;
  let strategy: PlanningStrategy = 'auto';
  let globs: string[] = [];
  let model: string | undefined;
  let maxParallel: number | undefined;
  let timeout: number | undefined;
  let continueOnFailure: boolean = true;

  // Extract quoted task description
  const taskMatch = args.match(/"([^"]+)"/);
  if (taskMatch) {
    task = taskMatch[1];
  } else {
    // Take first non-flag argument as task
    const nonFlagArgs = parts.filter(p => !p.startsWith('--'));
    task = nonFlagArgs[0] || '';
  }

  // Parse flags
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (part === '--agents' && i + 1 < parts.length) {
      agents = parseInt(parts[i + 1], 10) || 3;
      i++; // Skip next part
    } else if (part === '--strategy' && i + 1 < parts.length) {
      strategy = parts[i + 1] as PlanningStrategy;
      i++; // Skip next part
    } else if (part === '--globs' && i + 1 < parts.length) {
      globs = parts[i + 1].split(',').map(g => g.trim());
      i++; // Skip next part
    } else if (part === '--model' && i + 1 < parts.length) {
      model = parts[i + 1];
      i++; // Skip next part
    } else if (part === '--max-parallel' && i + 1 < parts.length) {
      maxParallel = parseInt(parts[i + 1], 10);
      i++; // Skip next part
    } else if (part === '--timeout' && i + 1 < parts.length) {
      timeout = parseInt(parts[i + 1], 10) * 1000; // Convert seconds to milliseconds
      i++; // Skip next part
    } else if (part === '--no-continue-on-failure') {
      continueOnFailure = false;
    }
  }

  return {
    task,
    agents,
    strategy,
    globs,
    model,
    maxParallel,
    timeout,
    continueOnFailure,
  };
}

/**
 * Display execution progress with a live table
 */
function displayExecutionProgress(
  context: CommandContext,
  report: ExecutionReport
): void {
  const { plan: reportPlan, executions } = report;
  
  // Clear previous output (in a real implementation, you'd use a proper progress display)
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `\n📋 Task: ${reportPlan.title}\n`,
    },
    Date.now(),
  );

  // Display subtask status table
  let statusTable = '┌─────┬──────────────────────────────────────┬─────────────┬─────────┬─────────┐\n';
  statusTable += '│ #   │ Goal                                 │ Agent       │ Status  │ Files   │\n';
  statusTable += '├─────┼──────────────────────────────────────┼─────────────┼─────────┼─────────┤\n';

  executions.forEach((exec, index) => {
    const goal = exec.subtask.goal.length > 36 
      ? exec.subtask.goal.substring(0, 33) + '...' 
      : exec.subtask.goal;
    const agent = (exec.agentUsed || 'pending').substring(0, 11);
    const status = getStatusDisplay(exec.status);
    const fileCount = exec.result?.changeset?.touchedFiles?.length || 0;
    
    statusTable += `│ ${(index + 1).toString().padEnd(3)} │ ${goal.padEnd(36)} │ ${agent.padEnd(11)} │ ${status.padEnd(7)} │ ${fileCount.toString().padEnd(7)} │\n`;
  });

  statusTable += '└─────┴──────────────────────────────────────┴─────────────┴─────────┴─────────┘';

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: statusTable,
    },
    Date.now(),
  );
}

/**
 * Get display representation of subtask status
 */
function getStatusDisplay(status: string): string {
  switch (status) {
    case 'pending': return '⏳ Wait';
    case 'running': return '🔄 Run';
    case 'completed': return '✅ Done';
    case 'failed': return '❌ Fail';
    case 'cancelled': return '🚫 Stop';
    default: return status;
  }
}

/**
 * Display final execution summary
 */
function displayExecutionSummary(
  context: CommandContext,
  report: ExecutionReport
): void {
  const { plan: reportPlan, executions, status, duration, aggregatedChangeset, conflicts, artifactsDir } = report;
  
  const durationMinutes = Math.round(duration / 60000);
  const completedCount = executions.filter(e => e.status === 'completed').length;
  const failedCount = executions.filter(e => e.status === 'failed').length;

  let summary = `\n🎯 **Delegation Complete**

**Task**: ${reportPlan.title}
**Overall Status**: ${status.toUpperCase()}
**Duration**: ${durationMinutes} minutes
**Completed**: ${completedCount}/${executions.length} subtasks
**Failed**: ${failedCount}/${executions.length} subtasks
**Files Modified**: ${aggregatedChangeset.touchedFiles.length}

`;

  if (conflicts.length > 0) {
    summary += `⚠️  **Conflicts Detected**: ${conflicts.length} files modified by multiple subtasks\n`;
    conflicts.forEach(conflict => {
      summary += `   - \`${conflict.filePath}\` (subtasks: ${conflict.subtaskIds.join(', ')})\n`;
    });
    summary += '\n';
  }

  if (aggregatedChangeset.touchedFiles.length > 0) {
    summary += `📁 **Modified Files**:\n`;
    aggregatedChangeset.touchedFiles.slice(0, 10).forEach(file => {
      summary += `   - ${file}\n`;
    });
    if (aggregatedChangeset.touchedFiles.length > 10) {
      summary += `   ... and ${aggregatedChangeset.touchedFiles.length - 10} more\n`;
    }
    summary += '\n';
  }

  if (aggregatedChangeset.testCommands && aggregatedChangeset.testCommands.length > 0) {
    summary += `🧪 **Suggested Test Commands**:\n`;
    aggregatedChangeset.testCommands.forEach(cmd => {
      summary += `   \`${cmd}\`\n`;
    });
    summary += '\n';
  }

  summary += `📂 **Artifacts**: ${artifactsDir}\n`;
  summary += `💡 Use \`/delegate report\` to view detailed results or \`/delegate report --open\` to open in VS Code`;

  context.ui.addItem(
    {
      type: status === 'failed' ? MessageType.ERROR : MessageType.INFO,
      text: summary,
    },
    Date.now(),
  );
}

export const delegateCommand: SlashCommand = {
  name: 'delegate',
  description: 'Delegate complex tasks to multiple AI agents working in parallel.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'report',
      description: 'View the last delegation execution report.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn> => {
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available.',
            };
          }

          const shouldOpen = args.includes('--open');
          
          // Find the most recent delegation artifacts
          const baseDir = config.getTargetDir();
          const delegateDir = path.join(baseDir, '.devx', 'delegate');
          
          try {
            const entries = await fs.readdir(delegateDir, { withFileTypes: true });
            const reportDirs = entries
              .filter(entry => entry.isDirectory())
              .map(entry => ({
                name: entry.name,
                path: path.join(delegateDir, entry.name),
              }))
              .sort((a, b) => b.name.localeCompare(a.name)); // Most recent first

            if (reportDirs.length === 0) {
              return {
                type: 'message',
                messageType: 'info',
                content: 'No delegation reports found. Run `/delegate` first to create a report.',
              };
            }

            const latestReport = reportDirs[0];
            const summaryPath = path.join(latestReport.path, 'summary.md');

            // Read and display the summary
            try {
              const summary = await fs.readFile(summaryPath, 'utf-8');
              
              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: summary,
                },
                Date.now(),
              );

              if (shouldOpen) {
                // Open in VS Code if requested
                const { spawn } = await import('node:child_process');
                spawn('code', [latestReport.path], { detached: true });
                
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: `Opened delegation artifacts in VS Code: ${latestReport.path}`,
                  },
                  Date.now(),
                );
              }

            } catch (error) {
              return {
                type: 'message',
                messageType: 'error',
                content: `Failed to read report: ${getErrorMessage(error)}`,
              };
            }

          } catch (error) {
            return {
              type: 'message',
              messageType: 'info',
              content: 'No delegation reports found. Run `/delegate` first to create a report.',
            };
          }

          return {
            type: 'message',
            messageType: 'info',
            content: 'Report displayed successfully.',
          };

        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to show report: ${getErrorMessage(error)}`,
          };
        }
      },
    },
  ],
  action: async (context, args): Promise<SlashCommandActionReturn> => {
    try {
      const config = context.services.config;
      if (!config) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Configuration not available.',
        };
      }

      // Parse command arguments
      const parsedArgs = parseDelegateArgs(args);
      
      if (!parsedArgs.task) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Usage: /delegate "task description" --agents=N [options]

Examples:
  /delegate "refactor the auth module" --agents=3
  /delegate "add comprehensive tests" --agents=4 --strategy=files
  /delegate "update documentation" --agents=2 --globs="docs/**,*.md"

Options:
  --agents=N              Number of agents to use (default: 3)
  --strategy=STRATEGY     Planning strategy: auto|files|skills|sequential|parallel (default: auto)
  --globs="pattern,..."   File patterns to restrict agents to (comma-separated)
  --model=MODEL           Model to use for planning (default: claude-4-sonnet)
  --max-parallel=N        Maximum parallel subtasks (default: 3 for Bedrock rate limiting)
  --timeout=SECONDS       Timeout per subtask in seconds (default: 600)
  --no-continue-on-failure  Stop if any subtask fails (default: continue)`,
        };
      }

      // Show planning start
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `🤖 Planning task delegation: "${parsedArgs.task}"\n⚙️  Strategy: ${parsedArgs.strategy}, Agents: ${parsedArgs.agents}`,
        },
        Date.now(),
      );

      // Create orchestrator
      const orchestrator = new Orchestrator(config);

      // Generate task plan
      const plan = await orchestrator.planTask(parsedArgs.task, {
        agentCount: parsedArgs.agents,
        strategy: parsedArgs.strategy,
        hints: parsedArgs.globs.length > 0 ? [`File scope: ${parsedArgs.globs.join(', ')}`] : [],
      });

      // Show plan summary
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `📋 Plan created: "${plan.title}"\n${plan.subtasks.map((s, i) => `${i + 1}. ${s.goal}`).join('\n')}`,
        },
        Date.now(),
      );

      if (plan.risks && plan.risks.length > 0) {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `⚠️  Identified risks:\n${plan.risks.map(r => `• ${r}`).join('\n')}`,
          },
          Date.now(),
        );
      }

      // Set up execution progress tracking
      let currentReport: ExecutionReport | undefined;

      orchestrator.on('planningComplete', (data) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `🚀 Starting execution with artifacts in: ${data.artifactsDir}`,
          },
          Date.now(),
        );
      });

      orchestrator.on('subtaskStarted', (data) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `▶️  Started subtask ${data.index + 1}: ${data.subtask.goal}`,
          },
          Date.now(),
        );
        
        // Update progress display
        if (currentReport) {
          displayExecutionProgress(context, currentReport);
        }
      });

      orchestrator.on('subtaskCompleted', (data) => {
        const fileCount = data.result.changeset?.touchedFiles?.length || 0;
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `✅ Completed subtask ${data.index + 1}: ${data.subtask.goal} (${fileCount} files modified)`,
          },
          Date.now(),
        );
      });

      orchestrator.on('subtaskFailed', (data) => {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `❌ Failed subtask ${data.index + 1}: ${data.subtask.goal}\nError: ${data.error}`,
          },
          Date.now(),
        );
      });

      orchestrator.on('executionComplete', (report) => {
        currentReport = report;
        displayExecutionSummary(context, report);
      });

      orchestrator.on('executionError', (data) => {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `💥 Execution failed: ${data.error}`,
          },
          Date.now(),
        );
      });

      // Execute the plan
      const executionConfig = {
        maxParallel: parsedArgs.maxParallel || 3, // Conservative for Bedrock
        baseDir: config.getTargetDir(),
        globalFileScope: parsedArgs.globs,
        subtaskTimeout: parsedArgs.timeout || 600000, // 10 minutes default
        continueOnFailure: parsedArgs.continueOnFailure,
        plannerModel: parsedArgs.model,
      };

      const report = await orchestrator.executePlan(plan, executionConfig);
      currentReport = report;

      // Final success message
      return {
        type: 'message',
        messageType: report.status === 'failed' ? 'error' : 'info',
        content: `Delegation ${report.status}. Use \`/delegate report\` to view detailed results.`,
      };

    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Delegation failed: ${getErrorMessage(error)}`,
      };
    }
  },
};