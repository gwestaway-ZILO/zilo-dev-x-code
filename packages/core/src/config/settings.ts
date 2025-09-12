/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * DevX-specific settings that extend the existing Gemini CLI settings system
 * This integrates with the existing settings in packages/cli/src/config/settings.ts
 */

/**
 * Agent-specific settings configuration
 */
export interface AgentSettings {
  /** Directory to search for agents (relative to settings file) */
  directory?: string;
  /** Maximum number of agents to load */
  maxAgents?: number;
  /** Auto-activate default agent on startup */
  autoActivate?: boolean;
  /** Default agent to activate on startup */
  defaultAgent?: string;
}

/**
 * DevX CLI settings that can be added to the existing settings.json structure
 */
export interface DevXExtendedSettings {
  /** Agent-specific settings */
  agents?: AgentSettings;
}

/**
 * DevX-specific settings loader that works alongside the existing Gemini CLI settings
 * This provides .devx directory support for agent-specific settings
 */
export class DevXSettingsLoader {
  private userDevXSettingsPath: string;
  private projectDevXSettingsPath: string;
  private cachedSettings: DevXExtendedSettings | null = null;
  private lastLoadTime: number = 0;
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor(workspaceRoot: string) {
    // User settings: ~/.devx/settings.json
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
    this.userDevXSettingsPath = path.join(homeDir, '.devx', 'settings.json');
    
    // Project settings: .devx/settings.json (in workspace root)
    this.projectDevXSettingsPath = path.join(workspaceRoot, '.devx', 'settings.json');
  }

  /**
   * Load and merge DevX-specific settings with project > user precedence
   */
  loadDevXSettings(): DevXExtendedSettings {
    const now = Date.now();
    
    // Return cached settings if still valid
    if (this.cachedSettings && (now - this.lastLoadTime) < this.CACHE_TTL) {
      return this.cachedSettings;
    }

    const userSettings = this.loadSettingsFile(this.userDevXSettingsPath);
    const projectSettings = this.loadSettingsFile(this.projectDevXSettingsPath);

    // Merge with project > user precedence
    const mergedSettings = this.mergeDevXSettings(userSettings, projectSettings);
    
    // Cache the result
    this.cachedSettings = mergedSettings;
    this.lastLoadTime = now;
    
    return mergedSettings;
  }

  /**
   * Load settings from a specific file
   */
  private loadSettingsFile(filePath: string): DevXExtendedSettings {
    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const settings = JSON.parse(content) as DevXExtendedSettings;
      
      // Basic validation
      this.validateDevXSettings(settings, filePath);
      
      return settings;
    } catch (error) {
      console.warn(`Warning: Failed to load DevX settings from ${filePath}:`, error instanceof Error ? error.message : error);
      return {};
    }
  }

  /**
   * Merge DevX settings with project > user precedence
   */
  private mergeDevXSettings(userSettings: DevXExtendedSettings, projectSettings: DevXExtendedSettings): DevXExtendedSettings {
    const merged: DevXExtendedSettings = { ...userSettings };

    // Merge agent settings (project wins)
    if (userSettings.agents || projectSettings.agents) {
      merged.agents = {
        ...userSettings.agents,
        ...projectSettings.agents
      };
    }

    return merged;
  }

  /**
   * Validate DevX settings structure
   */
  private validateDevXSettings(settings: DevXExtendedSettings, filePath: string): void {
    if (settings.agents) {
      if (settings.agents.maxAgents && (typeof settings.agents.maxAgents !== 'number' || settings.agents.maxAgents < 1)) {
        throw new Error(`Invalid agents.maxAgents in ${filePath}: must be a positive number`);
      }
    }
  }

  /**
   * Get the path to user DevX settings file
   */
  getUserDevXSettingsPath(): string {
    return this.userDevXSettingsPath;
  }

  /**
   * Get the path to project DevX settings file
   */
  getProjectDevXSettingsPath(): string {
    return this.projectDevXSettingsPath;
  }

  /**
   * Clear cached settings (force reload on next access)
   */
  clearCache(): void {
    this.cachedSettings = null;
    this.lastLoadTime = 0;
  }

  /**
   * Check if user DevX settings file exists
   */
  hasUserDevXSettings(): boolean {
    return fs.existsSync(this.userDevXSettingsPath);
  }

  /**
   * Check if project DevX settings file exists
   */
  hasProjectDevXSettings(): boolean {
    return fs.existsSync(this.projectDevXSettingsPath);
  }
}