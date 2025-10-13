/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

export interface ToolApprovalRequest {
  action: 'approve' | 'deny' | 'modify';
  reason?: string;
  modifiedContent?: string;
}

export interface ServerStats {
  timestamp: string;
  sessions: {
    totalSessions: number;
    activeSessions: number;
    totalPendingTools: number;
    riskySessions: number;
    sessionsWithPendingTools: number;
  };
  approvals: {
    pendingCount: number;
    totalHandled: number;
    averageApprovalTime: number;
  };
  connections: {
    totalConnections: number;
    sessionConnections: number;
    deviceTypes: Record<string, number>;
  };
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // Health check
  async getHealth(): Promise<{ status: string; timestamp: string; services: any }> {
    return this.request('/health');
  }

  // Session management
  async getSessions(): Promise<{ sessions: SessionInfo[] }> {
    return this.request('/sessions');
  }

  async getSession(sessionId: string): Promise<{ session: SessionInfo }> {
    return this.request(`/sessions/${sessionId}`);
  }

  async getSessionQR(sessionId: string): Promise<{
    sessionUrl: string;
    qrCode: string;
    instructions: string;
  }> {
    return this.request(`/sessions/${sessionId}/qr`);
  }

  async getPendingTools(sessionId: string): Promise<{
    pendingTools: PendingToolRequest[];
  }> {
    return this.request(`/sessions/${sessionId}/pending-tools`);
  }

  // Tool approval
  async approveTool(
    sessionId: string,
    toolId: string,
    data: ToolApprovalRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/sessions/${sessionId}/tools/${toolId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async denyTool(
    sessionId: string,
    toolId: string,
    data: ToolApprovalRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/sessions/${sessionId}/tools/${toolId}/deny`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async modifyTool(
    sessionId: string,
    toolId: string,
    data: ToolApprovalRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/sessions/${sessionId}/tools/${toolId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Statistics
  async getStats(): Promise<ServerStats> {
    return this.request('/stats');
  }

  async getConnectionStats(): Promise<{
    totalConnections: number;
    sessionConnections: number;
    deviceTypes: Record<string, number>;
  }> {
    return this.request('/stats/connections');
  }

  // Discovery
  async discover(): Promise<{
    name: string;
    version: string;
    capabilities: string[];
    activeSessions: number;
    totalPendingTools: number;
  }> {
    return this.request('/discover');
  }
}

export const apiService = new ApiService();