/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getCurrentGeminiMdFilename } from '../tools/memoryTool.js';
import { Storage } from './storage.js';

/**
 * Represents a memory source with its content and metadata
 */
export interface MemorySource {
  /** The file path of this memory source */
  filePath: string;
  /** The raw content of the memory file */
  content: string;
  /** Whether this source exists on disk */
  exists: boolean;
  /** The type of memory source */
  type: 'agent' | 'project' | 'user' | 'global';
}

/**
 * Import dependency with resolved content
 */
export interface ImportDependency {
  /** The import path as specified in the file */
  importPath: string;
  /** The resolved absolute file path */
  resolvedPath: string;
  /** The content of the imported file */
  content: string;
  /** Whether the imported file exists */
  exists: boolean;
}

/**
 * Result of memory composition with layering and imports resolved
 */
export interface ComposedMemory {
  /** The final composed memory content */
  content: string;
  /** All memory sources that contributed to the final content */
  sources: MemorySource[];
  /** All import dependencies that were resolved */
  imports: ImportDependency[];
  /** Any errors encountered during composition */
  errors: string[];
}

/**
 * Memory layering system that combines project and user memory files
 * with import support and cycle detection
 */
export class MemoryComposer {
  private readonly projectRoot: string;
  private readonly userMemoryPath: string;
  // Performance optimization: memory composition caching
  private compositionCache: { content: string; timestamp: number; sources: MemorySource[]; imports: ImportDependency[]; errors: string[] } | null = null;
  private readonly COMPOSITION_CACHE_TTL = 10000; // 10 seconds cache for memory composition
  // Future enhancement: import caching for better performance
  // private readonly importCache = new Map<string, { content: string; timestamp: number }>();
  // private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    
    // User memory: ~/.devx/DEVX.md
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
    this.userMemoryPath = path.join(homeDir, '.devx', 'DEVX.md');
  }

  /**
   * Compose layered memory with the following precedence:
   * 1. Agent memory (if provided)
   * 2. Project DevX.md (with imports)
   * 3. User ~/.devx/DEVX.md (with imports)
   * 4. Global .gemini/DevX.md (backward compatibility)
   */
  async composeMemory(agentMemory?: string): Promise<ComposedMemory> {
    // Performance optimization: return cached result if available and recent
    const now = Date.now();
    if (this.compositionCache && 
        (now - this.compositionCache.timestamp) < this.COMPOSITION_CACHE_TTL &&
        !agentMemory) { // Don't use cache if agent memory is provided
      return {
        content: this.compositionCache.content,
        sources: this.compositionCache.sources,
        imports: this.compositionCache.imports,
        errors: this.compositionCache.errors
      };
    }
    const sources: MemorySource[] = [];
    const imports: ImportDependency[] = [];
    const errors: string[] = [];
    const memoryContents: string[] = [];
    
    // Performance optimization: Add timeout to prevent hanging
    const COMPOSITION_TIMEOUT = 30000; // 30 seconds
    const startTime = Date.now();

    // 1. Agent memory (highest priority)
    if (agentMemory && agentMemory.trim()) {
      sources.push({
        filePath: '[agent-memory]',
        content: agentMemory,
        exists: true,
        type: 'agent'
      });
      memoryContents.push(agentMemory.trim());
    }

    // 2. Project DevX.md (with imports)
    const projectMemoryPath = path.join(this.projectRoot, getCurrentGeminiMdFilename());
    try {
      const projectSource = await this.loadMemorySource(projectMemoryPath, 'project');
      if (projectSource.exists && projectSource.content.trim()) {
        sources.push(projectSource);
        
        // Check timeout before expensive operations
        if (Date.now() - startTime > COMPOSITION_TIMEOUT) {
          errors.push('Memory composition timeout - using cached content without imports');
          memoryContents.push(projectSource.content.trim());
        } else {
          // Resolve imports for project memory
          const projectImports = await this.resolveImports(
            projectSource.content, 
            path.dirname(projectMemoryPath),
            new Set([projectMemoryPath]) // Start cycle detection with current file
          );
          imports.push(...projectImports.imports);
          errors.push(...projectImports.errors);
          
          memoryContents.push(projectImports.content);
        }
      }
    } catch (error) {
      errors.push(`Error loading project memory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. User ~/.devx/DEVX.md (with imports)
    try {
      const userSource = await this.loadMemorySource(this.userMemoryPath, 'user');
      if (userSource.exists && userSource.content.trim()) {
        sources.push(userSource);
        
        // Check timeout before expensive operations
        if (Date.now() - startTime > COMPOSITION_TIMEOUT) {
          errors.push('User memory composition timeout - using cached content without imports');
          memoryContents.push(userSource.content.trim());
        } else {
          // Resolve imports for user memory
          const userImports = await this.resolveImports(
            userSource.content,
            path.dirname(this.userMemoryPath),
            new Set([this.userMemoryPath]) // Start cycle detection with current file
          );
          imports.push(...userImports.imports);
          errors.push(...userImports.errors);
          
          memoryContents.push(userImports.content);
        }
      }
    } catch (error) {
      errors.push(`Error loading user memory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 4. Global .gemini/DevX.md (backward compatibility)
    try {
      const globalMemoryPath = path.join(Storage.getGlobalGeminiDir(), getCurrentGeminiMdFilename());
      const globalSource = await this.loadMemorySource(globalMemoryPath, 'global');
      if (globalSource.exists && globalSource.content.trim()) {
        sources.push(globalSource);
        memoryContents.push(globalSource.content.trim());
      }
    } catch (error) {
      errors.push(`Error loading global memory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Combine all memory content with appropriate separators
    const finalContent = memoryContents.length > 0 
      ? memoryContents.join('\n\n---\n\n')
      : '';

    const result = {
      content: finalContent,
      sources,
      imports,
      errors
    };

    // Cache the result for future requests (only if no agent memory)
    if (!agentMemory) {
      this.compositionCache = {
        content: finalContent,
        timestamp: Date.now(),
        sources: [...sources], // Clone arrays to avoid mutations
        imports: [...imports],
        errors: [...errors]
      };
    }

    // Performance monitoring
    const processingTime = Date.now() - startTime;
    if (processingTime > 1000) { // Log if it takes more than 1 second
      console.log(`[PERF] Memory composition took ${processingTime}ms (imports: ${imports.length}, sources: ${sources.length})`);
    }

    return result;
  }

  /**
   * Load a memory source from a file path
   */
  private async loadMemorySource(filePath: string, type: MemorySource['type']): Promise<MemorySource> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        filePath,
        content,
        exists: true,
        type
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return {
          filePath,
          content: '',
          exists: false,
          type
        };
      }
      throw error;
    }
  }

  /**
   * Resolve @import statements in memory content with cycle detection
   */
  private async resolveImports(
    content: string, 
    basePath: string, 
    visitedFiles: Set<string>
  ): Promise<{ content: string; imports: ImportDependency[]; errors: string[] }> {
    const imports: ImportDependency[] = [];
    const errors: string[] = [];
    
    // Performance limits to prevent infinite loops and excessive resource usage
    const MAX_IMPORT_DEPTH = 5;
    // const MAX_IMPORTS_PER_FILE = 20; // Future enhancement for import limiting
    
    if (visitedFiles.size > MAX_IMPORT_DEPTH) {
      errors.push(`Maximum import depth (${MAX_IMPORT_DEPTH}) exceeded`);
      return { content, imports, errors };
    }
    
    // Match @path/to/file.md imports (one per line)
    const importRegex = /^@(.+\.md)\s*$/gm;
    let match;
    let processedContent = content;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1].trim();
      const fullMatch = match[0];
      
      try {
        // Resolve the import path
        const resolvedPath = path.isAbsolute(importPath) 
          ? importPath 
          : path.resolve(basePath, importPath);

        // Check for cycles
        if (visitedFiles.has(resolvedPath)) {
          errors.push(`Circular import detected: ${importPath} -> ${resolvedPath}`);
          // Remove the import line to prevent infinite recursion
          processedContent = processedContent.replace(fullMatch, `<!-- Circular import: ${importPath} -->`);
          continue;
        }

        // Load the imported file
        const importedContent = await fs.readFile(resolvedPath, 'utf-8');
        
        // Add to visited files and recursively resolve imports
        const newVisitedFiles = new Set(visitedFiles);
        newVisitedFiles.add(resolvedPath);
        
        const nestedImports = await this.resolveImports(
          importedContent,
          path.dirname(resolvedPath),
          newVisitedFiles
        );

        imports.push({
          importPath,
          resolvedPath,
          content: nestedImports.content,
          exists: true
        });

        // Add nested imports and errors
        imports.push(...nestedImports.imports);
        errors.push(...nestedImports.errors);

        // Replace the import line with the resolved content
        processedContent = processedContent.replace(fullMatch, nestedImports.content.trim());

      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          errors.push(`Import not found: ${importPath} (resolved to: ${path.resolve(basePath, importPath)})`);
          imports.push({
            importPath,
            resolvedPath: path.resolve(basePath, importPath),
            content: '',
            exists: false
          });
          // Replace with a comment indicating missing import
          processedContent = processedContent.replace(fullMatch, `<!-- Missing import: ${importPath} -->`);
        } else {
          errors.push(`Error importing ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
          processedContent = processedContent.replace(fullMatch, `<!-- Error importing: ${importPath} -->`);
        }
      }
    }

    return {
      content: processedContent,
      imports,
      errors
    };
  }

  /**
   * Get the user memory file path
   */
  getUserMemoryPath(): string {
    return this.userMemoryPath;
  }

  /**
   * Get the project memory file path
   */
  getProjectMemoryPath(): string {
    return path.join(this.projectRoot, getCurrentGeminiMdFilename());
  }

  /**
   * Check if user memory file exists
   */
  async hasUserMemory(): Promise<boolean> {
    try {
      await fs.access(this.userMemoryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if project memory file exists
   */
  async hasProjectMemory(): Promise<boolean> {
    try {
      const projectMemoryPath = path.join(this.projectRoot, getCurrentGeminiMdFilename());
      await fs.access(projectMemoryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the user memory directory if it doesn't exist
   */
  async ensureUserMemoryDirectory(): Promise<void> {
    const userMemoryDir = path.dirname(this.userMemoryPath);
    await fs.mkdir(userMemoryDir, { recursive: true });
  }

  /**
   * Invalidate the composition cache (call when memory files are modified)
   */
  invalidateCache(): void {
    this.compositionCache = null;
  }

  /**
   * Fast path for memory composition that skips expensive import resolution
   * Use this for simple operations that don't need full import processing
   */
  async composeMemoryFast(agentMemory?: string): Promise<ComposedMemory> {
    const sources: MemorySource[] = [];
    const imports: ImportDependency[] = [];
    const errors: string[] = [];
    const memoryContents: string[] = [];
    
    // Performance optimization: Skip timeout and import resolution for fast path
    const startTime = Date.now();

    // 1. Agent memory (highest priority)
    if (agentMemory && agentMemory.trim()) {
      sources.push({
        filePath: '[agent-memory]',
        content: agentMemory,
        exists: true,
        type: 'agent'
      });
      memoryContents.push(agentMemory.trim());
    }

    // 2. Project DevX.md (without imports for fast path)
    const projectMemoryPath = path.join(this.projectRoot, getCurrentGeminiMdFilename());
    try {
      const projectSource = await this.loadMemorySource(projectMemoryPath, 'project');
      if (projectSource.exists && projectSource.content.trim()) {
        sources.push(projectSource);
        memoryContents.push(projectSource.content.trim());
      }
    } catch (error) {
      errors.push(`Error loading project memory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. User ~/.devx/DEVX.md (without imports for fast path)
    try {
      const userSource = await this.loadMemorySource(this.userMemoryPath, 'user');
      if (userSource.exists && userSource.content.trim()) {
        sources.push(userSource);
        memoryContents.push(userSource.content.trim());
      }
    } catch (error) {
      errors.push(`Error loading user memory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Skip global memory for fast path since it's just backward compatibility

    // Combine all memory content with appropriate separators
    const finalContent = memoryContents.length > 0 
      ? memoryContents.join('\n\n---\n\n')
      : '';

    const processingTime = Date.now() - startTime;
    if (processingTime > 100) { // Log if it takes more than 100ms even on fast path
      console.log(`[PERF] Fast memory composition took ${processingTime}ms`);
    }

    return {
      content: finalContent,
      sources,
      imports,
      errors
    };
  }

  /**
   * Create an empty user memory file
   */
  async createUserMemoryFile(initialContent: string = ''): Promise<void> {
    await this.ensureUserMemoryDirectory();
    
    const defaultContent = initialContent || `# User DevX Memory

This file contains your personal DevX memory that applies across all projects.

## Personal Preferences
<!-- Add your coding preferences, common patterns, etc. -->

## Common Workflows
<!-- Add your frequently used workflows -->

## Import Examples
<!-- You can import other memory files:
@./shared/coding-standards.md
@./shared/project-templates.md
-->
`;

    await fs.writeFile(this.userMemoryPath, defaultContent, 'utf-8');
    
    // Invalidate cache since user memory file was created/modified
    this.invalidateCache();
  }
}