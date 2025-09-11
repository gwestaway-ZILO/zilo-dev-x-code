#!/usr/bin/env node

/**
 * Test to confirm the root cause of empty parameters in tool calls
 */

import { spawn } from 'child_process';

console.log('=== TESTING ROOT CAUSE WITH COMPREHENSIVE DEBUGGING ===');

// Start the CLI with debugging enabled
const cliProcess = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DEBUG: '1', // Enable debug output
  }
});

// Capture all output
cliProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[CLI STDOUT]', output);
});

cliProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('[CLI STDERR]', output);
});

// Send the problematic command
setTimeout(() => {
  console.log('\n=== SENDING PROBLEMATIC COMMAND ===');
  cliProcess.stdin.write('List the files in the current directory using the list_directory tool with the absolute path.\n');
}, 2000);

// Kill the process after a reasonable time
setTimeout(() => {
  console.log('\n=== KILLING PROCESS ===');
  cliProcess.kill('SIGTERM');
}, 10000);

cliProcess.on('exit', (code) => {
  console.log(`\n=== CLI EXITED WITH CODE: ${code} ===`);
  process.exit(0);
});