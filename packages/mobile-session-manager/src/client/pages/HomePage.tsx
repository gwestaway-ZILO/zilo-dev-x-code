/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiService, type ServerStats } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

export function HomePage() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, connectionError } = useWebSocket();

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const statsData = await apiService.getStats();
        setStats(statsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner"></div>
          <p className="text-muted">Loading DevX CLI Mobile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">
          DevX CLI Mobile Session Manager
        </h1>
        <p className="text-secondary">
          Manage your DevX CLI sessions and approve tool requests from your mobile device
        </p>
      </header>

      {/* Connection Status */}
      <div className={`card mb-6 ${isConnected ? 'border-success' : 'border-error'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
          <div>
            <p className="font-medium">
              {isConnected ? 'Connected to DevX CLI' : 'Disconnected'}
            </p>
            {connectionError && (
              <p className="text-sm text-error">{connectionError}</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="card mb-6 border-error bg-error-bg">
          <p className="text-error">{error}</p>
        </div>
      )}

      {/* Statistics Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <h3 className="text-2xl font-bold text-primary">
              {stats.sessions.activeSessions}
            </h3>
            <p className="text-secondary">Active Sessions</p>
          </div>
          
          <div className="card text-center">
            <h3 className="text-2xl font-bold text-warning">
              {stats.sessions.totalPendingTools}
            </h3>
            <p className="text-secondary">Pending Tools</p>
          </div>
          
          <div className="card text-center">
            <h3 className="text-2xl font-bold text-error">
              {stats.sessions.riskySessions}
            </h3>
            <p className="text-secondary">Risky Sessions</p>
          </div>
          
          <div className="card text-center">
            <h3 className="text-2xl font-bold text-success">
              {stats.connections.totalConnections}
            </h3>
            <p className="text-secondary">Mobile Connections</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link 
          to="/sessions" 
          className="card hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-primary rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary">View Sessions</h3>
              <p className="text-secondary">Browse and connect to active DevX CLI sessions</p>
            </div>
          </div>
        </Link>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-success rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary">Scan QR Code</h3>
              <p className="text-secondary">Scan QR code from DevX CLI to connect instantly</p>
            </div>
          </div>
        </div>
      </div>

      {/* Device Connection Info */}
      {stats && (
        <div className="card">
          <h3 className="text-lg font-semibold text-primary mb-4">Connected Devices</h3>
          <div className="space-y-2">
            {Object.entries(stats.connections.deviceTypes).map(([deviceType, count]) => (
              <div key={deviceType} className="flex justify-between items-center">
                <span className="capitalize text-secondary">{deviceType} Devices</span>
                <span className="font-medium text-primary">{count}</span>
              </div>
            ))}
          </div>
          {stats.connections.totalConnections === 0 && (
            <p className="text-muted text-center py-4">No devices currently connected</p>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-muted text-sm mt-8 pb-4">
        <p>DevX CLI Mobile Session Manager v1.0.0</p>
        <p>Secure local network connection to your DevX CLI instance</p>
      </footer>
    </div>
  );
}