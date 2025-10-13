/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { ApprovalMode } from '@google/gemini-cli-core';

/**
 * Integration service for mobile session management
 * Handles starting/stopping the mobile server when mobile approval mode is active
 */
export class MobileSessionIntegration {
  private config: Config;
  private mobileServer: any = null;
  private isRunning = false;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Start mobile session server if mobile approval mode is enabled
   */
  async startIfNeeded(): Promise<void> {
    if (this.config.getApprovalMode() === ApprovalMode.MOBILE && 
        this.config.isMobileSessionEnabled() && 
        !this.isRunning) {
      
      await this.startMobileServer();
    }
  }

  /**
   * Stop mobile session server
   */
  async stop(): Promise<void> {
    if (this.mobileServer && this.isRunning) {
      try {
        await this.mobileServer.stop();
        this.mobileServer = null;
        this.isRunning = false;
        console.log('Mobile session server stopped');
      } catch (error) {
        console.error('Error stopping mobile session server:', error);
      }
    }
  }

  /**
   * Get the mobile server URL for QR code generation
   */
  getServerUrl(): string | null {
    if (!this.isRunning) return null;
    
    const port = this.config.getMobileSessionPort();
    return `http://localhost:${port}`;
  }

  /**
   * Check if mobile session is active
   */
  isActive(): boolean {
    return this.isRunning;
  }

  private async startMobileServer(): Promise<void> {
    try {
      // Dynamic import to avoid loading mobile server dependencies unless needed
      const { startMobileSessionServer } = await import('@google/gemini-cli-mobile-session-manager/dist/server/index.js');
      
      const sessionManager = this.config.getSessionManager();
      const toolApprovalBridge = this.config.getToolApprovalBridge();
      const port = this.config.getMobileSessionPort();

      if (!sessionManager || !toolApprovalBridge) {
        console.warn('Mobile session components not initialized, cannot start mobile server');
        return;
      }

      // Register the current session
      const sessionInfo = sessionManager.registerSession();
      
      this.mobileServer = await startMobileSessionServer(port, sessionManager, toolApprovalBridge);
      this.isRunning = true;

      console.log(`Mobile session server started on port ${port}`);
      console.log(`Session: ${sessionInfo.name}`);
      console.log(`Mobile URL: http://localhost:${port}/session/${sessionInfo.id}`);
      console.log(`QR Code: http://localhost:${port}/api/sessions/${sessionInfo.id}/qr`);
      
      // Log local network access info
      this.logNetworkInfo(port);
      
    } catch (error) {
      console.error('Failed to start mobile session server:', error);
      console.error('Make sure the mobile session manager package is built and available');
    }
  }

  private logNetworkInfo(port: number): void {
    try {
      const os = require('node:os');
      const networkInterfaces = os.networkInterfaces();
      const localIPs: string[] = [];

      for (const [, interfaces] of Object.entries(networkInterfaces)) {
        if (!interfaces) continue;
        
        for (const iface of interfaces as any[]) {
          // Skip internal and non-IPv4 addresses
          if (iface.family === 'IPv4' && !iface.internal) {
            localIPs.push(iface.address);
          }
        }
      }

      if (localIPs.length > 0) {
        console.log('\nAccess from mobile devices:');
        localIPs.forEach(ip => {
          console.log(`  http://${ip}:${port}`);
        });
        console.log('');
      }
    } catch (error) {
      // Ignore network info errors
    }
  }
}