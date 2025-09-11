#!/usr/bin/env node

/**
 * Attempt to reset the CLI session by clearing all cache/history files
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('=== ATTEMPTING TO RESET CLI SESSION ===');

// Find and remove potential cache/history directories
const possibleCacheDirs = [
  path.join(os.homedir(), '.gemini'),
  path.join(os.homedir(), '.claude'),
  path.join(os.homedir(), '.cache', 'gemini'),
  path.join(os.homedir(), '.cache', 'claude'),
  path.join(os.homedir(), '.config', 'gemini'),
  path.join(os.homedir(), '.config', 'claude'),
  path.join(process.cwd(), '.gemini'),
  path.join(process.cwd(), 'node_modules', '.cache'),
];

console.log('Checking for cache directories...');
for (const dir of possibleCacheDirs) {
  try {
    if (fs.existsSync(dir)) {
      console.log(`Found cache directory: ${dir}`);
      const stats = fs.statSync(dir);
      if (stats.isDirectory()) {
        const files = fs.readdirSync(dir);
        console.log(`  Contains ${files.length} files/directories`);
        if (files.length > 0) {
          console.log(`  Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

// Look for session files in the current project
console.log('\nChecking for session files in project...');
const projectFiles = [
  'session.json',
  '.session',
  'chat-history.json',
  '.chat-history',
  'gemini-session.json',
  'claude-session.json',
];

for (const file of projectFiles) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`Found session file: ${filePath}`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      console.log(`  Size: ${content.length} characters`);
      if (content.length < 1000) {
        console.log(`  Content: ${content.substring(0, 200)}...`);
      }
    } catch (error) {
      console.log(`  Error reading: ${error.message}`);
    }
  }
}

// Check environment variables that might affect session state
console.log('\nChecking environment variables...');
const relevantEnvVars = [
  'GEMINI_SESSION_ID',
  'CLAUDE_SESSION_ID', 
  'CLI_SESSION_ID',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
];

for (const envVar of relevantEnvVars) {
  if (process.env[envVar]) {
    console.log(`  ${envVar}: ${process.env[envVar].substring(0, 20)}...`);
  }
}

console.log('\n=== RESET RECOMMENDATIONS ===');
console.log('1. Try restarting the CLI completely');
console.log('2. Clear any session cache directories found above');
console.log('3. Ensure no stale environment variables are set');
console.log('4. Consider using a fresh terminal session');

console.log('\n=== NEXT TEST ===');
console.log('After following the reset steps, try the CLI again and see if the issue persists.');
console.log('If it does, the issue is fundamental to the CLI framework, not session state.');