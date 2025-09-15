/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optimized buffer for streaming text content that avoids
 * excessive string concatenation and memory allocation.
 */
export class StreamBuffer {
  private chunks: string[] = [];
  private totalLength = 0;
  private readonly maxChunks: number;

  constructor(maxChunks = 1000) {
    this.maxChunks = maxChunks;
  }

  /**
   * Add a chunk of text to the buffer
   */
  append(chunk: string): void {
    if (!chunk) return;
    
    this.chunks.push(chunk);
    this.totalLength += chunk.length;
    
    // Prevent memory bloat by consolidating chunks when we have too many
    if (this.chunks.length > this.maxChunks) {
      this.consolidate();
    }
  }

  /**
   * Get the complete accumulated text
   */
  toString(): string {
    if (this.chunks.length === 0) return '';
    if (this.chunks.length === 1) return this.chunks[0];
    
    return this.chunks.join('');
  }

  /**
   * Get the length of accumulated text without creating the full string
   */
  get length(): number {
    return this.totalLength;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.chunks = [];
    this.totalLength = 0;
  }

  /**
   * Get the last N characters without building the full string
   */
  tail(n: number): string {
    if (n <= 0 || this.totalLength === 0) return '';
    if (n >= this.totalLength) return this.toString();

    let remaining = n;
    const tailChunks: string[] = [];
    
    for (let i = this.chunks.length - 1; i >= 0 && remaining > 0; i--) {
      const chunk = this.chunks[i];
      if (chunk.length <= remaining) {
        tailChunks.unshift(chunk);
        remaining -= chunk.length;
      } else {
        tailChunks.unshift(chunk.slice(-remaining));
        remaining = 0;
      }
    }
    
    return tailChunks.join('');
  }

  /**
   * Consolidate chunks to prevent excessive array growth
   */
  private consolidate(): void {
    if (this.chunks.length <= 1) return;
    
    // Consolidate all chunks into a single string
    const consolidated = this.chunks.join('');
    this.chunks = [consolidated];
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.totalLength === 0;
  }
}