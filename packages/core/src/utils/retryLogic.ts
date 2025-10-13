/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterMs?: number;
  onRetry?: (attempt: number, maxAttempts: number, delaySeconds: number, errorType: string) => void;
}

export interface RetryableError {
  isRetryable: boolean;
  delayMs?: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly lastError: Error,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Determines if an error is retryable based on common patterns
 */
export function isRetryableError(error: unknown): RetryableError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let errorString = errorMessage.toLowerCase();

  // Handle wrapped Bedrock errors
  if (errorString.includes('bedrock api error:') || errorString.includes('bedrock streaming error:')) {
    // Extract the inner error message after the wrapper
    const parts = errorString.split(/bedrock (?:api|streaming) error:\s*/);
    if (parts.length > 1) {
      errorString = parts[1].trim();
    }
  }

  // Bedrock/AWS specific rate limiting and transient errors
  if (
    errorString.includes('too many tokens') ||
    errorString.includes('throttlingexception') ||
    errorString.includes('toomanyrequestsexception') ||
    errorString.includes('rate limit') ||
    errorString.includes('rate-limit') ||
    errorString.includes('quota exceeded') ||
    errorString.includes('service unavailable') ||
    errorString.includes('serviceunavailableexception') ||
    errorString.includes('internalserverexception') ||
    errorString.includes('modelnotreadyexception') ||
    errorString.includes('modelstreaminerrorexception') ||
    errorString.includes('timeout') ||
    errorString.includes('503') ||
    errorString.includes('502') ||
    errorString.includes('500') ||
    errorString.includes('429') ||
    errorString.includes('socket hang up') ||
    errorString.includes('broken pipe')
  ) {
    // Extract retry-after delay if present
    let delayMs: number | undefined;
    const retryAfterMatch = errorMessage.match(/retry.after[:\s]+(\d+)/i);
    if (retryAfterMatch) {
      delayMs = parseInt(retryAfterMatch[1], 10) * 1000; // Convert seconds to ms
    }
    
    return { isRetryable: true, delayMs };
  }

  // Network/connection errors
  if (
    errorString.includes('network') ||
    errorString.includes('connection') ||
    errorString.includes('econnreset') ||
    errorString.includes('enotfound') ||
    errorString.includes('etimedout')
  ) {
    return { isRetryable: true };
  }

  return { isRetryable: false };
}

// Removed quota-aware retry logic - using simplified approach based on actual API responses

/**
 * Executes a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 10, // Match Claude Code's 10 attempts
    initialDelayMs = 1000,
    maxDelayMs = 35000, // Match Claude Code's max delay
    backoffMultiplier = 2,
    jitterMs = 500, // More jitter to prevent thundering herd
    onRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      const retryInfo = isRetryableError(error);
      if (!retryInfo.isRetryable) {
        // Not a retryable error, throw immediately
        throw lastError;
      }

      // Calculate delay with exponential backoff
      let delayMs: number;
      if (retryInfo.delayMs !== undefined) {
        // Use server-suggested delay
        delayMs = Math.min(retryInfo.delayMs, maxDelayMs);
      } else {
        // Use exponential backoff
        delayMs = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs,
        );
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * jitterMs;
      delayMs += jitter;

      // Claude Code style logging: "API Error (Rate limited) · Retrying in 4 seconds… (attempt 3/10)"
      const delaySeconds = Math.round(delayMs / 1000);
      const errorMsg = lastError.message.toLowerCase();
      const errorType = errorMsg.includes('rate limit') || errorMsg.includes('too many tokens') || errorMsg.includes('throttling')
        ? 'Rate limited' 
        : errorMsg.includes('timeout') || errorMsg.includes('etimedout')
        ? 'Request timed out'
        : errorMsg.includes('connection') || errorMsg.includes('network') || errorMsg.includes('econnreset')
        ? 'Connection error'
        : errorMsg.includes('service unavailable') || errorMsg.includes('503') || errorMsg.includes('502')
        ? 'Service unavailable'
        : errorMsg.includes('internal server') || errorMsg.includes('500')
        ? 'Server error'
        : 'API error';
      
      // Emit retry event if callback provided, otherwise fallback to console.log
      if (onRetry) {
        onRetry(attempt + 1, maxRetries + 1, delaySeconds, errorType);
      } else {
        console.log(`✕ API Error (${errorType}) · Retrying in ${delaySeconds} seconds… (attempt ${attempt + 1}/${maxRetries + 1})`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new RetryError(
    `Operation failed after ${maxRetries + 1} attempts: ${lastError.message}`,
    lastError,
    maxRetries + 1,
  );
}

/**
 * Specialized retry for streaming operations
 */
export async function withStreamRetry<T>(
  createStream: () => Promise<AsyncGenerator<T>>,
  options: RetryOptions = {},
): Promise<AsyncGenerator<T>> {
  const {
    maxRetries = 5, // More retries for streams to match Claude Code persistence
    initialDelayMs = 2000,
    maxDelayMs = 20000, // Longer max delay for streaming operations
    backoffMultiplier = 2,
    jitterMs = 1000, // More jitter for streaming
  } = options;

  return withRetry(createStream, {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitterMs,
  });
}