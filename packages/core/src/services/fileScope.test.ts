/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect } from 'vitest';
import { FileScopeService } from './fileScope.js';
import * as path from 'node:path';

describe('FileScopeService', () => {
  let fileScope: FileScopeService;
  const testBaseDir = '/test/project';

  beforeEach(() => {
    // Reset any existing service instances
  });

  describe('constructor', () => {
    it('should create instance with default configuration', () => {
      fileScope = new FileScopeService({});
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });

    it('should create instance with custom base directory', () => {
      fileScope = new FileScopeService({ baseDir: testBaseDir });
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });

    it('should create instance with include patterns', () => {
      fileScope = new FileScopeService({
        include: ['src/**/*', 'test/**/*'],
        baseDir: testBaseDir,
      });
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });

    it('should create instance with exclude patterns', () => {
      fileScope = new FileScopeService({
        exclude: ['node_modules/**/*', '*.log'],
        baseDir: testBaseDir,
      });
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });
  });

  describe('fromGlobs static method', () => {
    it('should create instance from glob patterns', () => {
      const globs = ['src/**/*', 'test/**/*'];
      fileScope = FileScopeService.fromGlobs(globs, testBaseDir);
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });

    it('should handle empty glob patterns', () => {
      fileScope = FileScopeService.fromGlobs([], testBaseDir);
      expect(fileScope).toBeInstanceOf(FileScopeService);
    });
  });

  describe('isPathAllowed', () => {
    beforeEach(() => {
      fileScope = new FileScopeService({
        include: ['src/**/*'],
        exclude: ['src/**/*.test.ts'],
        baseDir: testBaseDir,
      });
    });

    it('should allow paths that match include patterns', () => {
      const result = fileScope.isPathAllowed('src/components/Button.ts');
      expect(result.allowed).toBe(true);
    });

    it('should reject paths that match exclude patterns', () => {
      const result = fileScope.isPathAllowed('src/components/Button.test.ts');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Path matched exclude pattern');
    });

    it('should reject paths that do not match include patterns', () => {
      const result = fileScope.isPathAllowed('config/webpack.config.js');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Path not matched by any include pattern');
    });

    it('should handle absolute paths', () => {
      const absolutePath = path.join(testBaseDir, 'src/utils/helper.ts');
      const result = fileScope.isPathAllowed(absolutePath);
      expect(result.allowed).toBe(true);
    });

    it('should handle relative paths', () => {
      const result = fileScope.isPathAllowed('./src/utils/helper.ts');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getScopeSummary', () => {
    it('should return summary for unrestricted scope', () => {
      fileScope = new FileScopeService({});
      const summary = fileScope.getScopeSummary();
      expect(summary).toContain('Include: all files');
    });

    it('should return summary with include patterns only', () => {
      fileScope = new FileScopeService({
        include: ['src/**/*', 'test/**/*'],
      });
      const summary = fileScope.getScopeSummary();
      expect(summary).toContain('Include: src/**/*');
      expect(summary).toContain('test/**/*');
    });

    it('should return summary with exclude patterns only', () => {
      fileScope = new FileScopeService({
        exclude: ['node_modules/**/*'],
      });
      const summary = fileScope.getScopeSummary();
      expect(summary).toContain('Include: all files');
      expect(summary).toContain('Exclude: node_modules/**/*');
    });

    it('should return summary with both include and exclude patterns', () => {
      fileScope = new FileScopeService({
        include: ['src/**/*'],
        exclude: ['src/**/*.test.ts'],
        baseDir: testBaseDir,
      });
      const summary = fileScope.getScopeSummary();
      expect(summary).toContain('Include: src/**/*');
      expect(summary).toContain('Exclude: src/**/*.test.ts');
      expect(summary).toContain(`Base: ${testBaseDir}`);
    });
  });

  describe('edge cases', () => {
    it('should handle empty file path', () => {
      fileScope = new FileScopeService({ include: ['src/**/*'] });
      const result = fileScope.isPathAllowed('');
      expect(result.allowed).toBe(false);
    });

    it('should handle paths with special characters', () => {
      fileScope = new FileScopeService({ include: ['src/**/*'] });
      const result = fileScope.isPathAllowed('src/components/Button@2x.ts');
      expect(result.allowed).toBe(true);
    });

    it('should handle paths with spaces', () => {
      fileScope = new FileScopeService({ include: ['src/**/*'] });
      const result = fileScope.isPathAllowed('src/my component/Button.ts');
      expect(result.allowed).toBe(true);
    });

    it('should normalize path separators', () => {
      fileScope = new FileScopeService({ include: ['src/**/*'] });
      const windowsPath = 'src\\components\\Button.ts';
      const result = fileScope.isPathAllowed(windowsPath);
      expect(result.allowed).toBe(true);
    });
  });
});