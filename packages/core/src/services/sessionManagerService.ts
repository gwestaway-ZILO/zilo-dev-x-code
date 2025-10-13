/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { Config } from '../config/config.js';
import type { WaitingToolCall } from '../core/coreToolScheduler.js';

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
  approvalMode: string;
  isActive: boolean;
  pendingToolsCount: number;
}

export interface PendingToolRequest {
  callId: string;
  sessionId: string;
  toolName: string;
  displayName: string;
  description: string;
  confirmationDetails: any;
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

/**
 * Manages sessions for mobile app integration
 * Tracks active DevX CLI sessions and pending tool approvals
 */
export class SessionManagerService extends EventEmitter {
  private activeSessions: Map<string, SessionInfo> = new Map();
  private pendingTools: Map<string, PendingToolRequest> = new Map();
  private config: Config;
  private mobileServerPort: number;

  constructor(config: Config, mobileServerPort: number = 8080) {
    super();
    this.config = config;
    this.mobileServerPort = mobileServerPort;
  }

  /**
   * Register a new session
   */
  registerSession(): SessionInfo {
    const sessionInfo: SessionInfo = {
      id: this.config.getSessionId(),
      name: `DevX CLI - ${this.config.getTargetDir().split('/').pop() || 'Unknown'}`,
      workspacePath: this.config.getTargetDir(),
      currentAgent: this.config.getCurrentAgent()?.name,
      model: this.config.getEffectiveModel(),
      host: 'localhost',
      port: this.mobileServerPort,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      approvalMode: this.config.getApprovalMode(),
      isActive: true,
      pendingToolsCount: 0
    };

    this.activeSessions.set(sessionInfo.id, sessionInfo);
    this.emit('session_registered', sessionInfo);
    
    return sessionInfo;
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date().toISOString();
      this.emit('session_updated', session);
    }
  }

  /**
   * Add a pending tool request for mobile approval
   */
  addPendingTool(sessionId: string, toolCall: WaitingToolCall): string {
    const safetyRating = this.evaluateToolSafety(toolCall);
    const priority = this.evaluateToolPriority(toolCall);

    const pendingTool: PendingToolRequest = {
      callId: toolCall.request.callId,
      sessionId,
      toolName: toolCall.request.name,
      displayName: toolCall.tool.displayName,
      description: toolCall.invocation.getDescription(),
      confirmationDetails: toolCall.confirmationDetails,
      requestedAt: new Date().toISOString(),
      priority,
      safetyRating
    };

    this.pendingTools.set(toolCall.request.callId, pendingTool);
    
    // Update session pending count
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.pendingToolsCount++;
      this.updateSessionActivity(sessionId);
    }

    this.emit('tool_pending', pendingTool);
    return toolCall.request.callId;
  }

  /**
   * Remove a pending tool request (approved/denied)
   */
  removePendingTool(callId: string): void {
    const pendingTool = this.pendingTools.get(callId);
    if (pendingTool) {
      this.pendingTools.delete(callId);
      
      // Update session pending count
      const session = this.activeSessions.get(pendingTool.sessionId);
      if (session && session.pendingToolsCount > 0) {
        session.pendingToolsCount--;
        this.updateSessionActivity(pendingTool.sessionId);
      }

      this.emit('tool_resolved', { callId, sessionId: pendingTool.sessionId });
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get pending tools for a session
   */
  getPendingTools(sessionId: string): PendingToolRequest[] {
    return Array.from(this.pendingTools.values())
      .filter(tool => tool.sessionId === sessionId)
      .sort((a, b) => {
        // Sort by priority (high first), then by timestamp
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      });
  }

  /**
   * Get all pending tools across all sessions
   */
  getAllPendingTools(): PendingToolRequest[] {
    return Array.from(this.pendingTools.values());
  }

  /**
   * Get pending tool by call ID
   */
  getPendingTool(callId: string): PendingToolRequest | undefined {
    return this.pendingTools.get(callId);
  }

  /**
   * Deactivate a session
   */
  deactivateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.emit('session_deactivated', session);
      
      // Clean up pending tools for this session
      const sessionTools = Array.from(this.pendingTools.values())
        .filter(tool => tool.sessionId === sessionId);
      
      sessionTools.forEach(tool => {
        this.pendingTools.delete(tool.callId);
      });
    }
  }

  /**
   * Remove a session completely
   */
  removeSession(sessionId: string): void {
    this.deactivateSession(sessionId);
    this.activeSessions.delete(sessionId);
    this.emit('session_removed', { sessionId });
  }

  /**
   * Generate QR code URL for session connection
   */
  generateSessionUrl(sessionId: string): string {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    return `http://${session.host}:${session.port}/session/${sessionId}`;
  }

  /**
   * Evaluate tool safety rating based on tool type and context
   */
  private evaluateToolSafety(toolCall: WaitingToolCall): 'safe' | 'moderate' | 'risky' {
    const toolName = toolCall.request.name.toLowerCase();
    
    // Risky tools that can modify system or sensitive files
    if (toolName.includes('shell') || toolName.includes('write') || toolName.includes('edit')) {
      if (toolCall.confirmationDetails.type === 'edit') {
        // Check if editing sensitive files
        const filePath = toolCall.confirmationDetails.fileName?.toLowerCase() || '';
        if (filePath.includes('config') || filePath.includes('.env') || 
            filePath.includes('password') || filePath.includes('key')) {
          return 'risky';
        }
        return 'moderate';
      }
      return 'moderate';
    }

    // Safe tools for reading/searching
    if (toolName.includes('read') || toolName.includes('grep') || 
        toolName.includes('search') || toolName.includes('ls')) {
      return 'safe';
    }

    // Default to moderate for unknown tools
    return 'moderate';
  }

  /**
   * Evaluate tool priority based on tool type and timing
   */
  private evaluateToolPriority(toolCall: WaitingToolCall): 'low' | 'medium' | 'high' {
    const toolName = toolCall.request.name.toLowerCase();
    
    // High priority for potentially destructive operations
    if (toolName.includes('shell') && 
        (toolCall.invocation.getDescription().includes('rm ') ||
         toolCall.invocation.getDescription().includes('delete') ||
         toolCall.invocation.getDescription().includes('format'))) {
      return 'high';
    }

    // Medium priority for file modifications
    if (toolName.includes('write') || toolName.includes('edit')) {
      return 'medium';
    }

    // Low priority for read operations
    return 'low';
  }

  /**
   * Get session statistics
   */
  getSessionStats(): any {
    const totalSessions = this.activeSessions.size;
    const activeSessions = Array.from(this.activeSessions.values())
      .filter(s => s.isActive).length;
    const totalPendingTools = this.pendingTools.size;
    const riskySessions = Array.from(this.activeSessions.values())
      .filter(s => this.getPendingTools(s.id).some(t => t.safetyRating === 'risky')).length;

    return {
      totalSessions,
      activeSessions,
      totalPendingTools,
      riskySessions,
      sessionsWithPendingTools: Array.from(this.activeSessions.values())
        .filter(s => s.pendingToolsCount > 0).length
    };
  }
}