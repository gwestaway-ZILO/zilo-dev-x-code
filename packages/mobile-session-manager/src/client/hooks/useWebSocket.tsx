/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface WebSocketMessage {
  type: 'session_update' | 'tool_request' | 'tool_response' | 'error' | 'ping' | 'pong';
  sessionId?: string;
  payload?: any;
  timestamp: string;
  messageId?: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: WebSocketMessage) => void;
  subscribeToSession: (sessionId: string) => void;
  connectionError: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message:', message);
    }
  };

  const subscribeToSession = (sessionId: string) => {
    sendMessage({
      type: 'session_update',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: { action: 'subscribe' }
    });
  };

  const connect = () => {
    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Send initial ping
        sendMessage({
          type: 'ping',
          timestamp: new Date().toISOString(),
          messageId: `ping-${Date.now()}`
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          // Respond to pings
          if (message.type === 'ping') {
            sendMessage({
              type: 'pong',
              timestamp: new Date().toISOString(),
              messageId: message.messageId
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        
        // Attempt to reconnect if it wasn't a manual close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError('Failed to reconnect to server after multiple attempts');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to connect to server');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionError(null);
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!isConnected) return;
    
    const heartbeat = setInterval(() => {
      sendMessage({
        type: 'ping',
        timestamp: new Date().toISOString(),
        messageId: `heartbeat-${Date.now()}`
      });
    }, 30000); // Ping every 30 seconds
    
    return () => clearInterval(heartbeat);
  }, [isConnected]);

  const contextValue: WebSocketContextType = {
    isConnected,
    lastMessage,
    sendMessage,
    subscribeToSession,
    connectionError
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}