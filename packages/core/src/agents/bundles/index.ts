/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentBundle } from '../types.js';
import { essentialAgentsBundle } from './essential.js';
import { securityAgentsBundle } from './security.js';

/**
 * All available built-in agent bundles
 */
export const BUILT_IN_BUNDLES: Record<string, AgentBundle> = {
  essential: essentialAgentsBundle,
  security: securityAgentsBundle,
};

/**
 * Default bundle installed on first /init
 */
export const DEFAULT_BUNDLE = essentialAgentsBundle;

/**
 * Get a bundle by name
 */
export function getBundle(name: string): AgentBundle | undefined {
  return BUILT_IN_BUNDLES[name];
}

/**
 * Get all available bundle names
 */
export function getBundleNames(): string[] {
  return Object.keys(BUILT_IN_BUNDLES);
}

/**
 * Get bundles by category
 */
export function getBundlesByCategory(category: string): AgentBundle[] {
  return Object.values(BUILT_IN_BUNDLES).filter(bundle => bundle.category === category);
}

export { essentialAgentsBundle, securityAgentsBundle };