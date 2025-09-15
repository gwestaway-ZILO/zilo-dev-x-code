/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const agentCommand: SlashCommand = {
  name: 'agent',
  description: 'Commands for managing and switching between AI agents.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      description: 'List all available agents.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<void | SlashCommandActionReturn> => {
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          const agents = agentLoader.loadAgents();
          
          if (agents.size === 0) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No agents found. Create your first agent with `/agent create`',
              },
              Date.now(),
            );
            return;
          }

          const currentAgent = config.getCurrentAgent();
          let listText = 'Available agents:\n\n';
          
          for (const [name, agent] of agents) {
            const isActive = currentAgent?.name === name;
            const marker = isActive ? '→ ' : '  ';
            const scope = agent.metadata.scope === 'user' ? '(user)' : '(workspace)';
            const model = agent.model ? ` [${agent.model}]` : '';
            listText += `${marker}**${name}**${model} ${scope}\n`;
            listText += `    ${agent.description}\n`;
            if (agent.tools && agent.tools.length > 0) {
              listText += `    Tools: ${agent.tools.join(', ')}\n`;
            }
            listText += '\n';
          }

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: listText.trim(),
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error listing agents: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'use',
      description: 'Switch to a specific agent for the current session.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /agent use <agent-name>',
          };
        }

        const agentName = args.trim();
        
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          const agent = agentLoader.getAgent(agentName);
          
          if (!agent) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Agent '${agentName}' not found. Use '/agent list' to see available agents.`,
            };
          }

          // Switch to the agent
          config.setCurrentAgent(agent);

          // Update tools in the chat to reflect agent's restricted tool set
          const geminiClient = config.getGeminiClient();
          await geminiClient.setTools();
          
          // Reset the chat to ensure the new tool restrictions take effect
          await geminiClient.resetChat();

          const model = agent.model ? ` using ${agent.model}` : '';
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Switched to agent: **${agent.name}**${model}\n${agent.description}`,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error switching to agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'show',
      description: 'Show details of a specific agent.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /agent show <agent-name>',
          };
        }

        const agentName = args.trim();
        
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          const agent = agentLoader.getAgent(agentName);
          
          if (!agent) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Agent '${agentName}' not found. Use '/agent list' to see available agents.`,
            };
          }

          let details = `**Agent: ${agent.name}**\n\n`;
          details += `**Description:** ${agent.description}\n\n`;
          
          if (agent.model) {
            details += `**Model:** ${agent.model}\n\n`;
          }
          
          if (agent.tools && agent.tools.length > 0) {
            details += `**Tools:** ${agent.tools.join(', ')}\n\n`;
          }
          
          if (agent.memory) {
            details += `**Memory:** ${agent.memory}\n\n`;
          }
          
          details += `**Scope:** ${agent.metadata.scope}\n`;
          details += `**File:** ${agent.metadata.filePath}\n\n`;
          
          details += `**System Prompt:**\n\`\`\`\n${agent.prompt}\n\`\`\``;

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: details,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error showing agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'current',
      description: 'Show the currently active agent.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<void | SlashCommandActionReturn> => {
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const currentAgent = config.getCurrentAgent();
          
          if (!currentAgent) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No agent is currently active. Use `/agent use <name>` to activate an agent.',
              },
              Date.now(),
            );
            return;
          }

          const model = currentAgent.model ? ` using ${currentAgent.model}` : '';
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Current agent: **${currentAgent.name}**${model}\n${currentAgent.description}`,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error getting current agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'clear',
      description: 'Clear the currently active agent and return to default behavior.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<void | SlashCommandActionReturn> => {
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const currentAgent = config.getCurrentAgent();
          
          if (!currentAgent) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No agent is currently active.',
              },
              Date.now(),
            );
            return;
          }

          // Clear the current agent
          config.clearCurrentAgent();
          
          // Restore full tool set
          const geminiClient = config.getGeminiClient();
          await geminiClient.setTools();
          
          // Reset the chat to ensure the tool changes take effect
          await geminiClient.resetChat();

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Cleared agent: **${currentAgent.name}**. Returned to default behavior with all tools available.`,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error clearing agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'create',
      description: 'Create a new agent interactively.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        const agentName = args?.trim();
        
        if (!agentName) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /agent create <agent-name>',
          };
        }

        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          
          // Check if agent already exists
          if (agentLoader.getAgent(agentName)) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Agent '${agentName}' already exists. Use '/agent show ${agentName}' to see its details.`,
            };
          }

          // Create a basic agent template
          const defaultPrompt = `You are ${agentName}, an AI assistant specialized for specific tasks.

Please provide clear, helpful responses and use the available tools when appropriate.`;

          const agentDefinition = {
            name: agentName,
            description: `AI assistant: ${agentName}`,
            prompt: defaultPrompt,
          };

          const filePath = agentLoader.createAgent(agentDefinition, 'workspace');

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Created agent '${agentName}' at: **${filePath}**\n\nUse '/agent edit ${agentName}' to customize the agent, or '/agent use ${agentName}' to activate it.`,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error creating agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'edit',
      description: 'Open an agent file in your preferred editor.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /agent edit <agent-name>',
          };
        }

        const agentName = args.trim();
        
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          const agent = agentLoader.getAgent(agentName);
          
          if (!agent) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Agent '${agentName}' not found. Use '/agent list' to see available agents.`,
            };
          }

          return {
            type: 'tool',
            toolName: 'edit_file',
            toolArgs: { 
              file_path: agent.metadata.filePath,
              editor: true 
            },
          };
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error editing agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'delete',
      description: 'Delete an agent file.',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /agent delete <agent-name>',
          };
        }

        const agentName = args.trim();
        
        try {
          const config = context.services.config;
          if (!config) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Configuration not available',
            };
          }

          const agentLoader = config.getAgentLoader();
          const agent = agentLoader.getAgent(agentName);
          
          if (!agent) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Agent '${agentName}' not found. Use '/agent list' to see available agents.`,
            };
          }

          // If this is the current agent, clear it first
          if (config.getCurrentAgent()?.name === agentName) {
            config.clearCurrentAgent();
          }

          const success = agentLoader.deleteAgent(agentName);
          
          if (success) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `Deleted agent '${agentName}' from ${agent.metadata.filePath}`,
              },
              Date.now(),
            );
          } else {
            context.ui.addItem(
              {
                type: MessageType.ERROR,
                text: `Failed to delete agent '${agentName}'`,
              },
              Date.now(),
            );
          }
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error deleting agent: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'bundle',
      description: 'Manage agent bundles - collections of related agents.',
      kind: CommandKind.BUILT_IN,
      subCommands: [
        {
          name: 'list',
          description: 'List available agent bundles.',
          kind: CommandKind.BUILT_IN,
          action: async (context): Promise<SlashCommandActionReturn | void> => {
            try {
              const config = context.services.config;
              if (!config) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: 'Configuration not available',
                };
              }

              // Import bundles dynamically to avoid circular dependencies
              const { BUILT_IN_BUNDLES } = await import('@google/gemini-cli-core');
              
              if (Object.keys(BUILT_IN_BUNDLES).length === 0) {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: 'No agent bundles available.',
                  },
                  Date.now(),
                );
                return;
              }

              let listText = 'Available agent bundles:\n\n';
              
              for (const [, bundle] of Object.entries(BUILT_IN_BUNDLES)) {
                listText += `**${bundle.name}** (${bundle.version})\n`;
                listText += `   Category: ${bundle.category}\n`;
                listText += `   ${bundle.description}\n`;
                listText += `   Agents: ${bundle.agents.map((a: any) => a.name).join(', ')}\n\n`;
              }

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: listText.trim(),
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Error listing bundles: ${getErrorMessage(error)}`,
                },
                Date.now(),
              );
            }
          },
        },
        {
          name: 'install',
          description: 'Install agents from a specific bundle.',
          kind: CommandKind.BUILT_IN,
          action: async (context, args): Promise<SlashCommandActionReturn | void> => {
            if (!args || args.trim() === '') {
              return {
                type: 'message',
                messageType: 'error',
                content: 'Usage: /agent bundle install <bundle-name>\n\nUse "/agent bundle list" to see available bundles.',
              };
            }

            const bundleName = args.trim();
            
            try {
              const config = context.services.config;
              if (!config) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: 'Configuration not available',
                };
              }

              const agentLoader = config.getAgentLoader();
              const bundle = agentLoader.getAvailableBundle(bundleName);
              
              if (!bundle) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: `Bundle '${bundleName}' not found. Use '/agent bundle list' to see available bundles.`,
                };
              }

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `Installing agents from bundle: **${bundle.name}**...`,
                },
                Date.now(),
              );

              const installedAgents = await agentLoader.installBundle(bundle, 'workspace');
              
              if (installedAgents.length > 0) {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: `✅ Successfully installed ${installedAgents.length} agents:\n${installedAgents.map(name => `   • ${name}`).join('\n')}\n\nUse '/agent list' to see all available agents.`,
                  },
                  Date.now(),
                );
              } else {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: 'All agents from this bundle are already installed.',
                  },
                  Date.now(),
                );
              }
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Error installing bundle: ${getErrorMessage(error)}`,
                },
                Date.now(),
              );
            }
          },
        },
        {
          name: 'show',
          description: 'Show details of a specific bundle.',
          kind: CommandKind.BUILT_IN,
          action: async (context, args): Promise<SlashCommandActionReturn | void> => {
            if (!args || args.trim() === '') {
              return {
                type: 'message',
                messageType: 'error',
                content: 'Usage: /agent bundle show <bundle-name>',
              };
            }

            const bundleName = args.trim();
            
            try {
              const config = context.services.config;
              if (!config) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: 'Configuration not available',
                };
              }

              const agentLoader = config.getAgentLoader();
              const bundle = agentLoader.getAvailableBundle(bundleName);
              
              if (!bundle) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: `Bundle '${bundleName}' not found. Use '/agent bundle list' to see available bundles.`,
                };
              }

              let details = `**Bundle: ${bundle.name}** (v${bundle.version})\n\n`;
              details += `**Description:** ${bundle.description}\n`;
              details += `**Category:** ${bundle.category}\n\n`;
              
              if (bundle.metadata?.author) {
                details += `**Author:** ${bundle.metadata.author}\n`;
              }
              
              if (bundle.metadata?.tags?.length) {
                details += `**Tags:** ${bundle.metadata.tags.join(', ')}\n`;
              }
              
              details += `\n**Agents in this bundle:**\n\n`;
              
              for (const agent of bundle.agents) {
                details += `• **${agent.name}**\n`;
                details += `  ${agent.description}\n`;
                if (agent.model) {
                  details += `  Model: ${agent.model}\n`;
                }
                if (agent.tools?.length) {
                  details += `  Tools: ${agent.tools.join(', ')}\n`;
                }
                details += '\n';
              }

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: details.trim(),
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Error showing bundle: ${getErrorMessage(error)}`,
                },
                Date.now(),
              );
            }
          },
        },
      ],
    },
  ],
};