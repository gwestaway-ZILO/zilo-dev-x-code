/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCallConfirmationDetails, ApprovalMode } from '@google/gemini-cli-core';

export interface SessionInfo {
  id: string;
  name: string;
  workspacePath: string;
  currentAgent?: string;
  model: string;
  host: string;
  port: number;
  createdAt: string;
  lastActivity: string;
  approvalMode: ApprovalMode;
  isActive: boolean;
  pendingToolsCount: number;
}

export interface PendingToolRequest {
  callId: string;
  sessionId: string;
  toolName: string;
  displayName: string;
  description: string;
  confirmationDetails: ToolCallConfirmationDetails;
  requestedAt: string;
  priority: 'low' | 'medium' | 'high';
  safetyRating: 'safe' | 'moderate' | 'risky';
}

export interface ToolApprovalDecision {
  callId: string;
  action: 'approve' | 'deny' | 'modify';
  reason?: string;
  modifiedContent?: string;
}

export interface SessionStats {
  totalToolCalls: number;
  approvedToolCalls: number;
  deniedToolCalls: number;
  averageApprovalTime: number;
  riskySessions: number;
}

export interface MobileSessionConfig {
  serverPort: number;
  enableNetworkDiscovery: boolean;
  maxConcurrentSessions: number;
  autoApprovalTimeout: number;
  requireAuthentication: boolean;
}

export interface WebSocketMessage {
  type: 'session_update' | 'tool_request' | 'tool_response' | 'error' | 'ping';
  sessionId?: string;
  payload?: any;
  timestamp: string;
}

export interface SessionConnection {
  sessionId: string;
  connectedAt: string;
  lastPing: string;
  clientInfo: {
    userAgent: string;
    ip: string;
    deviceType: 'mobile' | 'desktop' | 'tablet';
  };
}