/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { WebSocketManager } from './websocketManager.js';

// Validation schemas
const ToolApprovalSchema = z.object({
  action: z.enum(['approve', 'deny', 'modify']),
  reason: z.string().optional(),
  modifiedContent: z.string().optional(),
});

/**
 * Main server class that provides REST API for mobile session management
 */
export class MobileSessionServer {
  private sessionManager: any;
  private toolApprovalBridge: any;
  private wsManager: WebSocketManager;

  constructor(
    sessionManager: any,
    toolApprovalBridge: any,
    wsManager: WebSocketManager
  ) {
    this.sessionManager = sessionManager;
    this.toolApprovalBridge = toolApprovalBridge;
    this.wsManager = wsManager;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for session events and broadcast to WebSocket clients
    if (this.sessionManager) {
      this.sessionManager.on('session_registered', (session: any) => {
        this.wsManager.broadcastToAll({
          type: 'session_update',
          timestamp: new Date().toISOString(),
          payload: { event: 'session_registered', session }
        });
      });

      this.sessionManager.on('tool_pending', (toolRequest: any) => {
        this.wsManager.broadcastToSession(toolRequest.sessionId, {
          type: 'tool_request',
          timestamp: new Date().toISOString(),
          payload: { event: 'tool_pending', toolRequest }
        });
      });

      this.sessionManager.on('tool_resolved', (data: any) => {
        this.wsManager.broadcastToSession(data.sessionId, {
          type: 'tool_response',
          timestamp: new Date().toISOString(),
          payload: { event: 'tool_resolved', ...data }
        });
      });
    }

    // Listen for WebSocket tool approval events
    this.wsManager.on('tool_approval', (data: any) => {
      if (this.toolApprovalBridge && data.payload) {
        this.toolApprovalBridge.processApprovalDecision(data.payload);
      }
    });
  }

  /**
   * Setup Express routes for the API
   */
  public setupRoutes(app: Express): void {
    // Health check
    app.get('/api/health', this.handleHealthCheck.bind(this));

    // Session management
    app.get('/api/sessions', this.handleGetSessions.bind(this));
    app.get('/api/sessions/:sessionId', this.handleGetSession.bind(this));
    app.get('/api/sessions/:sessionId/qr', this.handleGetSessionQR.bind(this));
    app.get('/api/sessions/:sessionId/pending-tools', this.handleGetPendingTools.bind(this));

    // Tool approval
    app.post('/api/sessions/:sessionId/tools/:toolId/approve', this.handleToolApproval.bind(this));
    app.post('/api/sessions/:sessionId/tools/:toolId/deny', this.handleToolDenial.bind(this));
    app.put('/api/sessions/:sessionId/tools/:toolId', this.handleToolModification.bind(this));

    // Statistics
    app.get('/api/stats', this.handleGetStats.bind(this));
    app.get('/api/stats/connections', this.handleGetConnectionStats.bind(this));

    // Session discovery for mobile apps
    app.get('/api/discover', this.handleDiscovery.bind(this));
    
    // Session connection page
    app.get('/session/:sessionId', this.handleSessionPage.bind(this));
  }

  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        sessionManager: !!this.sessionManager,
        toolApprovalBridge: !!this.toolApprovalBridge,
        websocket: this.wsManager.getConnectionStats().totalConnections
      }
    });
  }

  private async handleGetSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!this.sessionManager) {
        res.status(503).json({ error: 'Session manager not available' });
        return;
      }

      const sessions = this.sessionManager.getActiveSessions();
      res.json({ sessions });
    } catch (error) {
      console.error('Error getting sessions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleGetSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!this.sessionManager) {
        res.status(503).json({ error: 'Session manager not available' });
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ session });
    } catch (error) {
      console.error('Error getting session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleGetSessionQR(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!this.sessionManager) {
        res.status(503).json({ error: 'Session manager not available' });
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const sessionUrl = this.sessionManager.generateSessionUrl(sessionId);
      const qrCodeDataUrl = await QRCode.toDataURL(sessionUrl);

      res.json({
        sessionUrl,
        qrCode: qrCodeDataUrl,
        instructions: `Scan this QR code with your mobile device to connect to the DevX CLI session "${session.name}"`
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  }

  private async handleGetPendingTools(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!this.sessionManager) {
        res.status(503).json({ error: 'Session manager not available' });
        return;
      }

      const pendingTools = this.sessionManager.getPendingTools(sessionId);
      res.json({ pendingTools });
    } catch (error) {
      console.error('Error getting pending tools:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleToolApproval(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, toolId } = req.params;
      const body = ToolApprovalSchema.parse(req.body);

      if (!this.toolApprovalBridge) {
        res.status(503).json({ error: 'Tool approval bridge not available' });
        return;
      }

      const decision = {
        callId: toolId,
        action: 'approve' as const,
        reason: body.reason
      };

      const success = this.toolApprovalBridge.processApprovalDecision(decision);
      
      if (success) {
        // Broadcast the approval to connected clients
        this.wsManager.broadcastToSession(sessionId, {
          type: 'tool_response',
          timestamp: new Date().toISOString(),
          payload: { event: 'tool_approved', callId: toolId, reason: body.reason }
        });

        res.json({ success: true, message: 'Tool approved successfully' });
      } else {
        res.status(404).json({ error: 'Tool request not found or already processed' });
      }
    } catch (error) {
      console.error('Error approving tool:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async handleToolDenial(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, toolId } = req.params;
      const body = ToolApprovalSchema.parse(req.body);

      if (!this.toolApprovalBridge) {
        res.status(503).json({ error: 'Tool approval bridge not available' });
        return;
      }

      const decision = {
        callId: toolId,
        action: 'deny' as const,
        reason: body.reason
      };

      const success = this.toolApprovalBridge.processApprovalDecision(decision);
      
      if (success) {
        // Broadcast the denial to connected clients
        this.wsManager.broadcastToSession(sessionId, {
          type: 'tool_response',
          timestamp: new Date().toISOString(),
          payload: { event: 'tool_denied', callId: toolId, reason: body.reason }
        });

        res.json({ success: true, message: 'Tool denied successfully' });
      } else {
        res.status(404).json({ error: 'Tool request not found or already processed' });
      }
    } catch (error) {
      console.error('Error denying tool:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async handleToolModification(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, toolId } = req.params;
      const body = ToolApprovalSchema.parse(req.body);

      if (!this.toolApprovalBridge) {
        res.status(503).json({ error: 'Tool approval bridge not available' });
        return;
      }

      const decision = {
        callId: toolId,
        action: 'modify' as const,
        reason: body.reason,
        modifiedContent: body.modifiedContent
      };

      const success = this.toolApprovalBridge.processApprovalDecision(decision);
      
      if (success) {
        this.wsManager.broadcastToSession(sessionId, {
          type: 'tool_response',
          timestamp: new Date().toISOString(),
          payload: { event: 'tool_modified', callId: toolId, modifiedContent: body.modifiedContent }
        });

        res.json({ success: true, message: 'Tool modification requested' });
      } else {
        res.status(404).json({ error: 'Tool request not found or already processed' });
      }
    } catch (error) {
      console.error('Error modifying tool:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async handleGetStats(req: Request, res: Response): Promise<void> {
    try {
      const sessionStats = this.sessionManager ? this.sessionManager.getSessionStats() : {};
      const approvalStats = this.toolApprovalBridge ? this.toolApprovalBridge.getApprovalStats() : {};
      const connectionStats = this.wsManager.getConnectionStats();

      res.json({
        timestamp: new Date().toISOString(),
        sessions: sessionStats,
        approvals: approvalStats,
        connections: connectionStats
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleGetConnectionStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.wsManager.getConnectionStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting connection stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleDiscovery(req: Request, res: Response): Promise<void> {
    try {
      const sessions = this.sessionManager ? this.sessionManager.getActiveSessions() : [];
      const serverInfo = {
        name: 'DevX CLI Mobile Session Manager',
        version: '1.0.0',
        capabilities: ['session_management', 'tool_approval', 'real_time_updates'],
        activeSessions: sessions.length,
        totalPendingTools: sessions.reduce((total: number, session: any) => total + session.pendingToolsCount, 0)
      };

      res.json(serverInfo);
    } catch (error) {
      console.error('Error in discovery:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleSessionPage(req: Request, res: Response): Promise<void> {
    // This will be served by the React app build
    // The React router will handle the /session/:sessionId route
    res.sendFile('index.html', { root: __dirname + '/../client' });
  }
}