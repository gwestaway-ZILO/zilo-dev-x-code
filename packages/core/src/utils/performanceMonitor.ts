/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface PerformanceMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Lightweight performance monitoring utility for tracking
 * operation latencies and bottlenecks in the Claude Bedrock integration.
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private debugMode: boolean = false;
  private readonly maxMetrics = 1000; // Prevent memory bloat

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetrics = {
      name,
      startTime: performance.now(),
      metadata,
    };
    
    this.metrics.set(name, metric);
    
    // Prevent memory bloat
    if (this.metrics.size > this.maxMetrics) {
      const firstKey = this.metrics.keys().next().value;
      if (firstKey !== undefined) {
        this.metrics.delete(firstKey);
      }
    }
  }

  /**
   * End timing an operation
   */
  endTimer(name: string): number | undefined {
    const metric = this.metrics.get(name);
    if (!metric) {
      if (this.debugMode) {
        console.warn(`Performance timer '${name}' not found`);
      }
      return undefined;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    if (this.debugMode && metric.duration !== undefined) {
      console.log(`[PERF] ${name}: ${metric.duration.toFixed(2)}ms`, metric.metadata || '');
    }

    return metric.duration;
  }

  /**
   * Time a function execution
   */
  async timeAsync<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    this.startTimer(name, metadata);
    try {
      const result = await fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeSync<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
    this.startTimer(name, metadata);
    try {
      const result = fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  /**
   * Get performance summary
   */
  getSummary(): { name: string; duration: number; metadata?: Record<string, any> }[] {
    return Array.from(this.metrics.values())
      .filter(m => m.duration !== undefined)
      .map(m => ({
        name: m.name,
        duration: m.duration!,
        metadata: m.metadata,
      }))
      .sort((a, b) => b.duration - a.duration);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Log slow operations (above threshold)
   */
  logSlowOperations(thresholdMs = 1000): void {
    const slowOps = Array.from(this.metrics.values())
      .filter(m => m.duration && m.duration > thresholdMs)
      .sort((a, b) => b.duration! - a.duration!);

    if (slowOps.length > 0) {
      console.warn('[PERF] Slow operations detected:');
      slowOps.forEach(op => {
        if (op.duration !== undefined) {
          console.warn(`  ${op.name}: ${op.duration.toFixed(2)}ms`);
        }
      });
    }
  }
}