/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { WaitingToolCall, ConfirmHandler } from '../core/coreToolScheduler.js';
import type { SessionManagerService, ToolApprovalDecision } from './sessionManagerService.js';
import { ToolConfirmationOutcome } from '../index.js';

/**
 * Bridges mobile app tool approvals with the CoreToolScheduler
 * Handles the communication between mobile decisions and CLI execution
 */
export class ToolApprovalBridge extends EventEmitter {
  private sessionManager: SessionManagerService;
  private pendingApprovals: Map<string, {
    toolCall: WaitingToolCall;
    resolve: (outcome: ToolConfirmationOutcome) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }> = new Map();
  private approvalTimeout: number;

  constructor(sessionManager: SessionManagerService, approvalTimeoutMs: number = 300000) {
    super();
    this.sessionManager = sessionManager;
    this.approvalTimeout = approvalTimeoutMs; // 5 minutes default

    // Listen for tool decisions from mobile app
    this.sessionManager.on('tool_approved', this.handleToolApproval.bind(this));
    this.sessionManager.on('tool_denied', this.handleToolDenial.bind(this));
    this.sessionManager.on('tool_modified', this.handleToolModification.bind(this));
  }

  /**
   * Create a mobile-compatible confirmation handler
   * This replaces the normal terminal-based confirmation
   */
  createMobileConfirmHandler(sessionId: string): ConfirmHandler {
    return async (toolCall: WaitingToolCall): Promise<ToolConfirmationOutcome> => {
      return new Promise((resolve, reject) => {
        const callId = toolCall.request.callId;
        
        // Add to session manager for mobile app visibility
        this.sessionManager.addPendingTool(sessionId, toolCall);

        // Store pending approval with timeout
        const timeout = setTimeout(() => {
          this.pendingApprovals.delete(callId);
          this.sessionManager.removePendingTool(callId);
          
          // Default to cancellation if no mobile response
          this.emit('approval_timeout', { callId, sessionId, toolCall });
          resolve(ToolConfirmationOutcome.Cancel);
        }, this.approvalTimeout);

        this.pendingApprovals.set(callId, {
          toolCall,
          resolve,
          reject,
          timeout
        });

        // Emit event for mobile app notification
        this.emit('tool_approval_required', {
          sessionId,
          callId,
          toolCall,
          expiresAt: Date.now() + this.approvalTimeout
        });
      });
    };
  }

  /**
   * Handle approval decision from mobile app
   */
  private handleToolApproval(decision: ToolApprovalDecision): void {
    const pending = this.pendingApprovals.get(decision.callId);
    if (!pending) {
      console.warn(`No pending approval found for call ID: ${decision.callId}`);
      return;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Remove from pending and session manager
    this.pendingApprovals.delete(decision.callId);
    this.sessionManager.removePendingTool(decision.callId);

    // Resolve with approval outcome
    pending.resolve(ToolConfirmationOutcome.ProceedOnce);

    this.emit('tool_approved_processed', {
      callId: decision.callId,
      reason: decision.reason
    });
  }

  /**
   * Handle denial decision from mobile app
   */
  private handleToolDenial(decision: ToolApprovalDecision): void {
    const pending = this.pendingApprovals.get(decision.callId);
    if (!pending) {
      console.warn(`No pending denial found for call ID: ${decision.callId}`);
      return;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Remove from pending and session manager
    this.pendingApprovals.delete(decision.callId);
    this.sessionManager.removePendingTool(decision.callId);

    // Resolve with cancellation outcome
    pending.resolve(ToolConfirmationOutcome.Cancel);

    this.emit('tool_denied_processed', {
      callId: decision.callId,
      reason: decision.reason
    });
  }

  /**
   * Handle modification request from mobile app
   */
  private handleToolModification(decision: ToolApprovalDecision): void {
    const pending = this.pendingApprovals.get(decision.callId);
    if (!pending) {
      console.warn(`No pending modification found for call ID: ${decision.callId}`);
      return;
    }

    // For now, modifications require manual editor intervention
    // This could be enhanced to apply mobile-provided content directly
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Remove from pending and session manager
    this.pendingApprovals.delete(decision.callId);
    this.sessionManager.removePendingTool(decision.callId);

    // Resolve with modify outcome to trigger editor
    pending.resolve(ToolConfirmationOutcome.ModifyWithEditor);

    this.emit('tool_modified_processed', {
      callId: decision.callId,
      modifiedContent: decision.modifiedContent
    });
  }

  /**
   * Process a mobile approval decision
   */
  processApprovalDecision(decision: ToolApprovalDecision): boolean {
    const pending = this.pendingApprovals.get(decision.callId);
    if (!pending) {
      return false;
    }

    switch (decision.action) {
      case 'approve':
        this.sessionManager.emit('tool_approved', decision);
        break;
      case 'deny':
        this.sessionManager.emit('tool_denied', decision);
        break;
      case 'modify':
        this.sessionManager.emit('tool_modified', decision);
        break;
      default:
        console.warn(`Unknown approval action: ${decision.action}`);
        return false;
    }

    return true;
  }

  /**
   * Get all pending approvals for a session
   */
  getPendingApprovals(sessionId: string): Array<{
    callId: string;
    toolCall: WaitingToolCall;
    expiresAt: number;
  }> {
    const result: Array<{
      callId: string;
      toolCall: WaitingToolCall;
      expiresAt: number;
    }> = [];

    for (const [callId, pending] of this.pendingApprovals.entries()) {
      // Find matching session tools
      const sessionTool = this.sessionManager.getPendingTool(callId);
      if (sessionTool && sessionTool.sessionId === sessionId) {
        result.push({
          callId,
          toolCall: pending.toolCall,
          expiresAt: Date.now() + this.approvalTimeout
        });
      }
    }

    return result;
  }

  /**
   * Force timeout a pending approval (for cleanup)
   */
  timeoutApproval(callId: string): boolean {
    const pending = this.pendingApprovals.get(callId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    this.pendingApprovals.delete(callId);
    this.sessionManager.removePendingTool(callId);
    pending.resolve(ToolConfirmationOutcome.Cancel);

    return true;
  }

  /**
   * Clean up all pending approvals for a session
   */
  cleanupSession(sessionId: string): void {
    const sessionTools = this.sessionManager.getPendingTools(sessionId);
    
    for (const tool of sessionTools) {
      this.timeoutApproval(tool.callId);
    }

    this.emit('session_cleaned_up', { sessionId });
  }

  /**
   * Get approval statistics
   */
  getApprovalStats(): {
    pendingCount: number;
    totalHandled: number;
    averageApprovalTime: number;
  } {
    return {
      pendingCount: this.pendingApprovals.size,
      totalHandled: 0, // TODO: Track this over time
      averageApprovalTime: 0 // TODO: Track approval times
    };
  }
}