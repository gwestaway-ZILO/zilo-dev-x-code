/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface WebSocketMessage {
  type: 'session_update' | 'tool_request' | 'tool_response' | 'error' | 'ping' | 'pong';
  sessionId?: string;
  payload?: any;
  timestamp: string;
  messageId?: string;
}

export interface ClientConnection {
  id: string;
  socket: WebSocket;
  sessionId?: string;
  connectedAt: Date;
  lastPing: Date;
  metadata: {
    userAgent?: string;
    ip?: string;
    deviceType?: 'mobile' | 'desktop' | 'tablet';
  };
}

/**
 * Manages WebSocket connections for real-time communication with mobile clients
 */
export class WebSocketManager {
  private wss: WebSocketServer;
  private connections: Map<string, ClientConnection> = new Map();
  private sessionConnections: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupWebSocketServer();
    this.startPingInterval();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (socket, request) => {
      const connectionId = uuidv4();
      const clientConnection: ClientConnection = {
        id: connectionId,
        socket,
        connectedAt: new Date(),
        lastPing: new Date(),
        metadata: {
          userAgent: request.headers['user-agent'],
          ip: request.socket.remoteAddress,
          deviceType: this.detectDeviceType(request.headers['user-agent'] || '')
        }
      };

      this.connections.set(connectionId, clientConnection);
      console.log(`WebSocket client connected: ${connectionId} (${clientConnection.metadata.deviceType})`);

      socket.on('message', (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(connectionId, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
          this.sendError(connectionId, 'Invalid message format');
        }
      });

      socket.on('close', () => {
        this.handleDisconnection(connectionId);
      });

      socket.on('error', (error) => {
        console.error(`WebSocket error for client ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
      });

      // Send initial connection acknowledgment
      this.sendMessage(connectionId, {
        type: 'ping',
        timestamp: new Date().toISOString(),
        payload: { message: 'Connected to DevX Mobile Session Manager' }
      });
    });
  }

  private handleMessage(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'ping':
        connection.lastPing = new Date();
        this.sendMessage(connectionId, {
          type: 'pong',
          timestamp: new Date().toISOString(),
          messageId: message.messageId
        });
        break;

      case 'session_update':
        if (message.sessionId) {
          this.subscribeToSession(connectionId, message.sessionId);
        }
        break;

      case 'tool_response':
        // Forward tool approval responses to the appropriate handlers
        this.emit('tool_approval', {
          connectionId,
          sessionId: message.sessionId,
          payload: message.payload
        });
        break;

      default:
        console.log(`Unhandled message type: ${message.type} from ${connectionId}`);
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Remove from session subscriptions
      if (connection.sessionId) {
        const sessionClients = this.sessionConnections.get(connection.sessionId);
        if (sessionClients) {
          sessionClients.delete(connectionId);
          if (sessionClients.size === 0) {
            this.sessionConnections.delete(connection.sessionId);
          }
        }
      }

      this.connections.delete(connectionId);
      console.log(`WebSocket client disconnected: ${connectionId}`);
    }
  }

  private subscribeToSession(connectionId: string, sessionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Unsubscribe from previous session if any
    if (connection.sessionId) {
      const oldSessionClients = this.sessionConnections.get(connection.sessionId);
      if (oldSessionClients) {
        oldSessionClients.delete(connectionId);
      }
    }

    // Subscribe to new session
    connection.sessionId = sessionId;
    
    let sessionClients = this.sessionConnections.get(sessionId);
    if (!sessionClients) {
      sessionClients = new Set();
      this.sessionConnections.set(sessionId, sessionClients);
    }
    sessionClients.add(connectionId);

    console.log(`Client ${connectionId} subscribed to session ${sessionId}`);
  }

  /**
   * Send a message to a specific connection
   */
  public sendMessage(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to all clients connected to a specific session
   */
  public broadcastToSession(sessionId: string, message: WebSocketMessage): number {
    const sessionClients = this.sessionConnections.get(sessionId);
    if (!sessionClients) return 0;

    let sentCount = 0;
    for (const connectionId of sessionClients) {
      if (this.sendMessage(connectionId, { ...message, sessionId })) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Broadcast a message to all connected clients
   */
  public broadcastToAll(message: WebSocketMessage): number {
    let sentCount = 0;
    for (const connectionId of this.connections.keys()) {
      if (this.sendMessage(connectionId, message)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * Send an error message to a specific connection
   */
  public sendError(connectionId: string, error: string): boolean {
    return this.sendMessage(connectionId, {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: { error }
    });
  }

  /**
   * Get statistics about active connections
   */
  public getConnectionStats(): {
    totalConnections: number;
    sessionConnections: number;
    deviceTypes: Record<string, number>;
  } {
    const deviceTypes: Record<string, number> = {};
    
    for (const connection of this.connections.values()) {
      const deviceType = connection.metadata.deviceType || 'unknown';
      deviceTypes[deviceType] = (deviceTypes[deviceType] || 0) + 1;
    }

    return {
      totalConnections: this.connections.size,
      sessionConnections: this.sessionConnections.size,
      deviceTypes
    };
  }

  /**
   * Get connections for a specific session
   */
  public getSessionConnections(sessionId: string): ClientConnection[] {
    const sessionClients = this.sessionConnections.get(sessionId);
    if (!sessionClients) return [];

    return Array.from(sessionClients)
      .map(id => this.connections.get(id))
      .filter((conn): conn is ClientConnection => conn !== undefined);
  }

  private detectDeviceType(userAgent: string): 'mobile' | 'desktop' | 'tablet' {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    
    return 'desktop';
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      const staleConnections: string[] = [];

      for (const [connectionId, connection] of this.connections) {
        const timeSinceLastPing = now.getTime() - connection.lastPing.getTime();
        
        // Remove connections that haven't pinged in 2 minutes
        if (timeSinceLastPing > 120000) {
          staleConnections.push(connectionId);
        } else if (timeSinceLastPing > 30000) {
          // Send ping to connections that haven't pinged in 30 seconds
          this.sendMessage(connectionId, {
            type: 'ping',
            timestamp: now.toISOString()
          });
        }
      }

      // Clean up stale connections
      staleConnections.forEach(id => this.handleDisconnection(id));
    }, 30000); // Run every 30 seconds
  }

  /**
   * Emit events (simple event emitter pattern)
   */
  private eventHandlers: Map<string, Function[]> = new Map();

  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    for (const connection of this.connections.values()) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close();
      }
    }
    
    this.connections.clear();
    this.sessionConnections.clear();
  }
}