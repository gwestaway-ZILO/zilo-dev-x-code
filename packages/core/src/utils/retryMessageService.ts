/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export interface RetryMessage {
  attempt: number;
  maxAttempts: number;
  delaySeconds: number;
  errorType: string;
}

/**
 * Global service for emitting retry messages from core to UI
 */
class RetryMessageService extends EventEmitter {
  private static instance: RetryMessageService;

  static getInstance(): RetryMessageService {
    if (!RetryMessageService.instance) {
      RetryMessageService.instance = new RetryMessageService();
    }
    return RetryMessageService.instance;
  }

  emitRetryMessage(message: RetryMessage): void {
    this.emit('retry', message);
  }

  onRetryMessage(callback: (message: RetryMessage) => void): void {
    this.on('retry', callback);
  }

  removeRetryListener(callback: (message: RetryMessage) => void): void {
    this.off('retry', callback);
  }
}

export const retryMessageService = RetryMessageService.getInstance();