/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode, getErrorMessage } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const mobileCommand: SlashCommand = {
  name: 'mobile',
  description: 'Manage mobile session for tool approval on mobile devices.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'status',
      description: 'Show mobile session status and connection information.',
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

          const isMobileEnabled = config.isMobileSessionEnabled();
          const approvalMode = config.getApprovalMode();
          const sessionManager = config.getSessionManager();
          const port = config.getMobileSessionPort();

          let statusText = '**Mobile Session Status**\n\n';
          
          if (approvalMode === ApprovalMode.MOBILE) {
            statusText += '✅ **Mobile approval mode**: Enabled\n';
            
            if (isMobileEnabled && sessionManager) {
              const sessions = sessionManager.getActiveSessions();
              const stats = sessionManager.getSessionStats();
              
              statusText += `📱 **Mobile server**: Running on port ${port}\n`;
              statusText += `🔗 **Active sessions**: ${sessions.length}\n`;
              statusText += `⏳ **Pending tools**: ${stats.totalPendingTools}\n\n`;
              
              if (sessions.length > 0) {
                const session = sessions[0]; // Primary session
                statusText += '**Connection Information:**\n';
                statusText += `• Session URL: http://localhost:${port}/session/${session.id}\n`;
                statusText += `• QR Code: http://localhost:${port}/api/sessions/${session.id}/qr\n\n`;
                
                statusText += '**To connect from mobile device:**\n';
                statusText += '1. Ensure your mobile device is on the same network\n';
                statusText += '2. Open the session URL in your mobile browser\n';
                statusText += '3. Or scan the QR code using your camera app\n';
              }
            } else {
              statusText += '❌ **Mobile server**: Not running\n';
              statusText += '💡 Run `/mobile start` to begin mobile session\n';
            }
          } else {
            statusText += '❌ **Mobile approval mode**: Disabled\n';
            statusText += '💡 Run `/mobile enable` to enable mobile approval\n';
          }

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: statusText.trim(),
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error getting mobile status: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'enable',
      description: 'Enable mobile approval mode and start mobile server.',
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

          // Check if already enabled
          if (config.getApprovalMode() === ApprovalMode.MOBILE) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'Mobile approval mode is already enabled. Use `/mobile status` for details.',
              },
              Date.now(),
            );
            return;
          }

          // Enable mobile approval mode
          config.setApprovalMode(ApprovalMode.MOBILE);
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: '✅ **Mobile approval mode enabled**\n\nTool requests will now be sent to connected mobile devices for approval.\n\nUse `/mobile status` to get connection information.',
            },
            Date.now(),
          );

        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error enabling mobile mode: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'disable',
      description: 'Disable mobile approval mode and return to terminal approval.',
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

          if (config.getApprovalMode() !== ApprovalMode.MOBILE) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'Mobile approval mode is not currently enabled.',
              },
              Date.now(),
            );
            return;
          }

          // Disable mobile approval mode and return to default
          config.setApprovalMode(ApprovalMode.DEFAULT);
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: '✅ **Mobile approval mode disabled**\n\nTool requests will now be handled in the terminal as usual.',
            },
            Date.now(),
          );

        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error disabling mobile mode: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'qr',
      description: 'Display QR code for mobile connection.',
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

          if (config.getApprovalMode() !== ApprovalMode.MOBILE) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Mobile approval mode is not enabled. Run `/mobile enable` first.',
            };
          }

          const sessionManager = config.getSessionManager();
          if (!sessionManager) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Mobile session manager not available.',
            };
          }

          const sessions = sessionManager.getActiveSessions();
          if (sessions.length === 0) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'No active sessions found.',
            };
          }

          const session = sessions[0];
          const port = config.getMobileSessionPort();
          const sessionUrl = `http://localhost:${port}/session/${session.id}`;
          const qrUrl = `http://localhost:${port}/api/sessions/${session.id}/qr`;

          let qrText = '**Mobile Session QR Code**\n\n';
          qrText += `📱 **Session**: ${session.name}\n`;
          qrText += `🔗 **URL**: ${sessionUrl}\n\n`;
          qrText += '**To connect:**\n';
          qrText += '1. Open your mobile camera app\n';
          qrText += '2. Point it at your terminal\n';
          qrText += '3. Visit the QR URL to see the code\n';
          qrText += `4. Or visit: ${qrUrl}\n\n`;
          qrText += '**Network Access:**\n';
          qrText += 'Make sure your mobile device is on the same WiFi network as this computer.';

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: qrText,
            },
            Date.now(),
          );

        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error displaying QR code: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};