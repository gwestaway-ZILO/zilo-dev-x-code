/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiService, type SessionInfo, type PendingToolRequest } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pendingTools, setPendingTools] = useState<PendingToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingTools, setProcessingTools] = useState<Set<string>>(new Set());
  const { lastMessage, subscribeToSession, isConnected } = useWebSocket();

  const loadSessionData = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const [sessionResponse, toolsResponse] = await Promise.all([
        apiService.getSession(sessionId),
        apiService.getPendingTools(sessionId)
      ]);
      
      setSession(sessionResponse.session);
      setPendingTools(toolsResponse.pendingTools);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSessionData();
      subscribeToSession(sessionId);
    }
  }, [sessionId]);

  // Listen for real-time updates
  useEffect(() => {
    if (lastMessage && lastMessage.sessionId === sessionId) {
      if (lastMessage.type === 'tool_request' || lastMessage.type === 'tool_response') {
        loadSessionData(); // Refresh data when tools change
      }
    }
  }, [lastMessage, sessionId]);

  const handleToolAction = async (
    toolId: string,
    action: 'approve' | 'deny',
    reason?: string
  ) => {
    if (!sessionId) return;

    setProcessingTools(prev => new Set(prev).add(toolId));
    
    try {
      const request = { action, reason };
      
      if (action === 'approve') {
        await apiService.approveTool(sessionId, toolId, request);
      } else {
        await apiService.denyTool(sessionId, toolId, request);
      }
      
      // Remove the tool from pending list immediately for better UX
      setPendingTools(prev => prev.filter(tool => tool.callId !== toolId));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} tool`);
    } finally {
      setProcessingTools(prev => {
        const newSet = new Set(prev);
        newSet.delete(toolId);
        return newSet;
      });
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 30) return 'Just now';
    if (diffMins < 1) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getSafetyColor = (rating: string) => {
    switch (rating) {
      case 'safe': return 'status-safe';
      case 'moderate': return 'status-moderate';
      case 'risky': return 'status-risky';
      default: return 'status-moderate';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-error';
      case 'medium': return 'text-warning';
      case 'low': return 'text-success';
      default: return 'text-secondary';
    }
  };

  if (loading && !session) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner"></div>
          <p className="text-muted">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <div className="card border-error bg-error-bg text-center">
          <h2 className="text-lg font-semibold text-error mb-2">Session Not Found</h2>
          <p className="text-error mb-4">{error}</p>
          <Link to="/sessions" className="button button-secondary">
            ← Back to Sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">{session?.name}</h1>
            <p className="text-secondary">{session?.workspacePath}</p>
          </div>
          <Link to="/sessions" className="button button-secondary">
            ← Back
          </Link>
        </div>

        {!isConnected && (
          <div className="card border-warning bg-warning-bg mb-4">
            <p className="text-warning">⚠️ WebSocket disconnected - updates may be delayed</p>
          </div>
        )}

        {error && (
          <div className="card border-error bg-error-bg mb-4">
            <p className="text-error">{error}</p>
          </div>
        )}
      </header>

      {/* Session Info */}
      {session && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-primary mb-4">Session Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-muted">Model</p>
              <p className="font-medium text-primary">{session.model}</p>
            </div>
            <div>
              <p className="text-muted">Current Agent</p>
              <p className="font-medium text-primary">{session.currentAgent || 'Default'}</p>
            </div>
            <div>
              <p className="text-muted">Approval Mode</p>
              <span className="status-badge status-moderate">{session.approvalMode}</span>
            </div>
            <div>
              <p className="text-muted">Last Activity</p>
              <p className="font-medium text-primary">{formatTimeAgo(session.lastActivity)}</p>
            </div>
            <div>
              <p className="text-muted">Status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${session.isActive ? 'bg-success' : 'bg-muted'}`} />
                <span className="font-medium text-primary">{session.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div>
              <p className="text-muted">Pending Tools</p>
              <p className="font-medium text-primary">{pendingTools.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Tools */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-primary mb-4">
          Pending Tool Approvals ({pendingTools.length})
        </h3>
        
        {pendingTools.length === 0 ? (
          <div className="card text-center py-8">
            <div className="mb-4">
              <svg className="w-12 h-12 text-success mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-primary mb-2">All Clear!</h4>
            <p className="text-secondary">No tools are currently waiting for approval.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingTools.map((tool) => (
              <div key={tool.callId} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-primary">{tool.displayName}</h4>
                      <span className={`status-badge ${getSafetyColor(tool.safetyRating)}`}>
                        {tool.safetyRating}
                      </span>
                      <span className={`text-xs font-medium ${getPriorityColor(tool.priority)}`}>
                        {tool.priority.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-secondary text-sm mb-2">{tool.description}</p>
                    <p className="text-muted text-xs">Requested {formatTimeAgo(tool.requestedAt)}</p>
                  </div>
                </div>

                {/* Tool confirmation details */}
                {tool.confirmationDetails && (
                  <div className="bg-tertiary rounded-md p-3 mb-4">
                    <h5 className="font-medium text-primary mb-2">Details:</h5>
                    {tool.confirmationDetails.type === 'edit' && (
                      <div className="space-y-2 text-sm">
                        {tool.confirmationDetails.fileName && (
                          <p><span className="text-muted">File:</span> {tool.confirmationDetails.fileName}</p>
                        )}
                        {tool.confirmationDetails.fileDiff && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-accent-primary">View Changes</summary>
                            <pre className="mt-2 text-xs bg-primary text-white p-2 rounded overflow-x-auto">
                              {tool.confirmationDetails.fileDiff}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleToolAction(tool.callId, 'approve')}
                    disabled={processingTools.has(tool.callId)}
                    className="button button-success flex-1 md:flex-none"
                  >
                    {processingTools.has(tool.callId) ? (
                      <>
                        <div className="loading-spinner w-4 h-4" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={() => handleToolAction(tool.callId, 'deny', 'Denied via mobile app')}
                    disabled={processingTools.has(tool.callId)}
                    className="button button-error flex-1 md:flex-none"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batch Actions */}
      {pendingTools.length > 1 && (
        <div className="card">
          <h4 className="font-medium text-primary mb-3">Batch Actions</h4>
          <div className="flex gap-2">
            <button
              onClick={() => {
                pendingTools.forEach(tool => {
                  if (!processingTools.has(tool.callId)) {
                    handleToolAction(tool.callId, 'approve');
                  }
                });
              }}
              disabled={processingTools.size > 0}
              className="button button-success"
            >
              Approve All
            </button>
            <button
              onClick={() => {
                pendingTools.forEach(tool => {
                  if (!processingTools.has(tool.callId)) {
                    handleToolAction(tool.callId, 'deny', 'Batch denied via mobile app');
                  }
                });
              }}
              disabled={processingTools.size > 0}
              className="button button-error"
            >
              Deny All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}