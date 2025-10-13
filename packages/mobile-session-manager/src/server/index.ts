/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MobileSessionServer } from './mobileSessionServer.js';
import { WebSocketManager } from './websocketManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main entry point for the mobile session manager server
 */
export async function startMobileSessionServer(
  port: number = 8080,
  sessionManager?: any,
  toolApprovalBridge?: any
): Promise<{ server: any; stop: () => Promise<void> }> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // CORS configuration for local network access
  app.use(cors({
    origin: '*', // Allow all origins for local network access
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../client')));

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(wss);

  // Initialize mobile session server
  const mobileServer = new MobileSessionServer(
    sessionManager,
    toolApprovalBridge,
    wsManager
  );

  // Setup API routes
  mobileServer.setupRoutes(app);

  // Serve the React app for any non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });

  return new Promise((resolve) => {
    const httpServer = server.listen(port, '0.0.0.0', () => {
      console.log(`Mobile Session Manager server running on http://0.0.0.0:${port}`);
      console.log(`Access from mobile devices at http://[YOUR_LOCAL_IP]:${port}`);
      
      resolve({
        server: httpServer,
        stop: async () => {
          return new Promise<void>((resolveStop) => {
            wss.close();
            httpServer.close(() => {
              console.log('Mobile Session Manager server stopped');
              resolveStop();
            });
          });
        }
      });
    });
  });
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env['PORT'] || '8080', 10);
  startMobileSessionServer(port).catch(console.error);
}