/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiService, type SessionInfo } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

export function SessionListPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastMessage, isConnected } = useWebSocket();

  const loadSessions = async () => {
    try {
      setLoading(true);
      const { sessions: sessionData } = await apiService.getSessions();
      setSessions(sessionData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Listen for session updates via WebSocket
  useEffect(() => {
    if (lastMessage?.type === 'session_update') {
      loadSessions(); // Refresh sessions when updates are received
    }
  }, [lastMessage]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getSessionStatusColor = (session: SessionInfo) => {
    if (!session.isActive) return 'bg-muted';
    if (session.pendingToolsCount > 0) return 'bg-warning';
    return 'bg-success';
  };

  const getApprovalModeColor = (mode: string) => {
    switch (mode) {
      case 'yolo': return 'status-risky';
      case 'mobile': return 'status-moderate';
      case 'autoEdit': return 'status-moderate';
      default: return 'status-safe';
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner"></div>
          <p className="text-muted">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-primary">Active Sessions</h1>
          <Link to="/" className="button button-secondary">
            ← Back to Home
          </Link>
        </div>
        
        {!isConnected && (
          <div className="card border-warning bg-warning-bg mb-4">
            <p className="text-warning">⚠️ WebSocket disconnected - session updates may be delayed</p>
          </div>
        )}

        {error && (
          <div className="card border-error bg-error-bg mb-4">
            <div className="flex items-center justify-between">
              <p className="text-error">{error}</p>
              <button 
                onClick={loadSessions} 
                className="button button-sm button-secondary"
                disabled={loading}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </header>

      {sessions.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mb-4">
            <svg className="w-16 h-16 text-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-primary mb-2">No Active Sessions</h3>
          <p className="text-secondary mb-4">
            Start a DevX CLI session with mobile approval mode enabled to see it here.
          </p>
          <p className="text-sm text-muted">
            Run: <code className="bg-tertiary px-2 py-1 rounded">devx --approval-mode mobile</code>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to={`/session/${session.id}`}
              className="card hover:shadow-md transition-shadow cursor-pointer block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getSessionStatusColor(session)}`} />
                  <div>
                    <h3 className="font-semibold text-primary">{session.name}</h3>
                    <p className="text-sm text-secondary">{session.workspacePath}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted">{formatTimeAgo(session.lastActivity)}</p>
                  {session.pendingToolsCount > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-warning text-white">
                      {session.pendingToolsCount} pending
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted">Model</p>
                  <p className="font-medium text-primary">{session.model}</p>
                </div>
                
                <div>
                  <p className="text-muted">Agent</p>
                  <p className="font-medium text-primary">{session.currentAgent || 'Default'}</p>
                </div>
                
                <div>
                  <p className="text-muted">Approval Mode</p>
                  <span className={`status-badge ${getApprovalModeColor(session.approvalMode)}`}>
                    {session.approvalMode}
                  </span>
                </div>
                
                <div>
                  <p className="text-muted">Status</p>
                  <p className="font-medium text-primary">
                    {session.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>

              {session.pendingToolsCount > 0 && (
                <div className="mt-3 p-3 bg-warning-bg rounded-md">
                  <p className="text-sm text-warning font-medium">
                    🔧 {session.pendingToolsCount} tool{session.pendingToolsCount > 1 ? 's' : ''} waiting for approval
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center mt-8">
        <button
          onClick={loadSessions}
          disabled={loading}
          className="button button-secondary"
        >
          {loading ? (
            <>
              <div className="loading-spinner w-4 h-4" />
              Refreshing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Sessions
            </>
          )}
        </button>
      </div>
    </div>
  );
}