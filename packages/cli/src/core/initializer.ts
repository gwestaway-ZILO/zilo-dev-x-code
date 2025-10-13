/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';
import { type LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import { MobileSessionIntegration } from '../services/mobileSessionIntegration.js';

export interface InitializationResult {
  authError: string | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
  mobileSessionIntegration?: MobileSessionIntegration;
}

/**
 * Orchestrates the application's startup initialization.
 * This runs BEFORE the React UI is rendered.
 * @param config The application config.
 * @param settings The loaded application settings.
 * @returns The results of the initialization.
 */
export async function initializeApp(
  config: Config,
  settings: LoadedSettings,
): Promise<InitializationResult> {
  const authError = await performInitialAuth(
    config,
    settings.merged.security?.auth?.selectedType,
  );
  const themeError = validateTheme(settings);

  const shouldOpenAuthDialog =
    settings.merged.security?.auth?.selectedType === undefined || !!authError;

  // Initialize mobile session integration if needed
  const mobileSessionIntegration = new MobileSessionIntegration(config);
  await mobileSessionIntegration.startIfNeeded();

  return {
    authError,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
    mobileSessionIntegration,
  };
}
