/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { SessionListPage } from './pages/SessionListPage';
import { WebSocketProvider } from './hooks/useWebSocket';

export function App() {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-secondary">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sessions" element={<SessionListPage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
        </Routes>
      </div>
    </WebSocketProvider>
  );
}