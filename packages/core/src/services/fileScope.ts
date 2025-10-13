/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import picomatch from 'picomatch';
import * as path from 'node:path';

/**
 * File scope configuration for limiting tool access to specific file patterns
 */
export interface FileScopeConfig {
  /** Glob patterns to include (e.g., "src/", "docs/*.md") */
  include?: string[];
  /** Glob patterns to exclude (e.g., "src/*.test.ts", "node_modules/") */
  exclude?: string[];
  /** Base directory for relative path resolution */
  baseDir?: string;
}

/**
 * Result of file scope validation
 */
export interface FileScopeResult {
  /** Whether the path is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** The rule that matched (for debugging) */
  matchedRule?: string;
}

/**
 * Service for managing file scope restrictions in multi-agent orchestration
 * Provides glob-based path filtering to prevent agent conflicts
 */
export class FileScopeService {
  private readonly config: FileScopeConfig;

  constructor(config: FileScopeConfig = {}) {
    this.config = {
      baseDir: process.cwd(),
      ...config,
    };
  }

  /**
   * Check if a file path is allowed by the current scope configuration
   */
  isPathAllowed(filePath: string): FileScopeResult {
    // No restrictions if no include patterns specified
    if (!this.config.include || this.config.include.length === 0) {
      return this.checkExcludePatterns(filePath);
    }

    const normalizedPath = this.normalizePath(filePath);

    // Check include patterns first
    const includeMatched = this.config.include.some(pattern => {
      const matcher = picomatch(pattern, { dot: true });
      return matcher(normalizedPath);
    });

    if (!includeMatched) {
      return {
        allowed: false,
        reason: 'Path not matched by any include pattern',
        matchedRule: `include: [${this.config.include.join(', ')}]`,
      };
    }

    // Check exclude patterns
    return this.checkExcludePatterns(filePath);
  }

  /**
   * Check exclude patterns for a given path
   */
  private checkExcludePatterns(filePath: string): FileScopeResult {
    if (!this.config.exclude || this.config.exclude.length === 0) {
      return { allowed: true };
    }

    const normalizedPath = this.normalizePath(filePath);

    for (const pattern of this.config.exclude) {
      const matcher = picomatch(pattern, { dot: true });
      if (matcher(normalizedPath)) {
        return {
          allowed: false,
          reason: 'Path matched exclude pattern',
          matchedRule: `exclude: ${pattern}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Normalize a file path for consistent matching
   */
  private normalizePath(filePath: string): string {
    // Convert to absolute path if relative
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(this.config.baseDir || process.cwd(), filePath);

    // Convert to relative path from base directory for pattern matching
    const relativePath = this.config.baseDir 
      ? path.relative(this.config.baseDir, absolutePath)
      : absolutePath;

    // Normalize path separators for cross-platform compatibility
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Get a summary of the current scope configuration
   */
  getScopeSummary(): string {
    const parts: string[] = [];

    if (this.config.include && this.config.include.length > 0) {
      parts.push(`Include: ${this.config.include.join(', ')}`);
    } else {
      parts.push('Include: all files');
    }

    if (this.config.exclude && this.config.exclude.length > 0) {
      parts.push(`Exclude: ${this.config.exclude.join(', ')}`);
    }

    if (this.config.baseDir) {
      parts.push(`Base: ${this.config.baseDir}`);
    }

    return parts.join(' | ');
  }

  /**
   * Create a new FileScopeService with merged configuration
   */
  withConfig(additionalConfig: Partial<FileScopeConfig>): FileScopeService {
    return new FileScopeService({
      ...this.config,
      ...additionalConfig,
      // Merge arrays instead of replacing
      include: additionalConfig.include 
        ? [...(this.config.include || []), ...additionalConfig.include]
        : this.config.include,
      exclude: additionalConfig.exclude
        ? [...(this.config.exclude || []), ...additionalConfig.exclude]
        : this.config.exclude,
    });
  }

  /**
   * Static helper to create a file scope service from glob patterns
   */
  static fromGlobs(
    globs: string[], 
    baseDir?: string
  ): FileScopeService {
    const include: string[] = [];
    const exclude: string[] = [];

    for (const glob of globs) {
      if (glob.startsWith('!')) {
        exclude.push(glob.slice(1));
      } else {
        include.push(glob);
      }
    }

    return new FileScopeService({
      include: include.length > 0 ? include : undefined,
      exclude: exclude.length > 0 ? exclude : undefined,
      baseDir,
    });
  }
}