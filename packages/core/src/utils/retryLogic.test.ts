/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, isRetryableError, RetryError } from './retryLogic.js';

describe('retryLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isRetryableError', () => {
    it('should identify Bedrock rate limiting errors as retryable', () => {
      const testCases = [
        'Too many tokens, please wait before trying again.',
        'ThrottlingException: Rate exceeded',
        'TooManyRequestsException: Request was throttled',
        'Rate limit exceeded',
        'quota exceeded',
        'service unavailable',
        '429 Too Many Requests',
        '503 Service Unavailable',
        '502 Bad Gateway',
      ];

      testCases.forEach(message => {
        const result = isRetryableError(new Error(message));
        expect(result.isRetryable).toBe(true);
      });
    });

    it('should identify network errors as retryable', () => {
      const testCases = [
        'Network error occurred',
        'Connection failed',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
      ];

      testCases.forEach(message => {
        const result = isRetryableError(new Error(message));
        expect(result.isRetryable).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const testCases = [
        'Invalid API key',
        'Unauthorized access',
        'Bad request format',
        'Model not found',
        'Invalid input parameters',
      ];

      testCases.forEach(message => {
        const result = isRetryableError(new Error(message));
        expect(result.isRetryable).toBe(false);
      });
    });

    it('should extract retry-after delay when present', () => {
      const error = new Error('Rate limit exceeded. Retry after: 30 seconds');
      const result = isRetryableError(error);
      
      expect(result.isRetryable).toBe(true);
      expect(result.delayMs).toBe(30000); // 30 seconds in ms
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt when no error occurs', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Too many tokens, please wait'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValue('success');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Start the retry operation
      const promise = withRetry(mockFn, {
        maxRetries: 3,
        initialDelayMs: 1000,
        jitterMs: 0, // Remove jitter for predictable testing
      });

      // Advance timers for each retry
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RETRY] Attempt 1/4 failed')
      );
      
      consoleSpy.mockRestore();
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
      
      await expect(withRetry(mockFn)).rejects.toThrow('Invalid API key');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw RetryError after max retries exceeded', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Too many tokens'));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const promise = withRetry(mockFn, {
        maxRetries: 2,
        initialDelayMs: 100,
        jitterMs: 0,
      });

      // Advance timers for retries
      vi.advanceTimersByTime(100); // First retry
      vi.advanceTimersByTime(200); // Second retry
      
      try {
        await expect(promise).rejects.toThrow(RetryError);
        await expect(promise).rejects.toThrow('Operation failed after 3 attempts');
      } catch (error) {
        // Expected to throw RetryError
      }
      
      expect(mockFn).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it('should use server-suggested delay when available', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded. Retry after: 5 seconds'))
        .mockResolvedValue('success');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const promise = withRetry(mockFn, {
        maxRetries: 1,
        initialDelayMs: 1000,
        jitterMs: 0,
      });

      // Should use the server-suggested 5 seconds instead of 1 second
      await vi.advanceTimersByTimeAsync(5000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 5000ms')
      );
      
      consoleSpy.mockRestore();
    });

    it('should apply exponential backoff', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Too many tokens'))
        .mockRejectedValueOnce(new Error('Too many tokens'))
        .mockResolvedValue('success');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const promise = withRetry(mockFn, {
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitterMs: 0,
      });

      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 1000ms')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 2000ms')
      );
      
      consoleSpy.mockRestore();
    });
  });
});