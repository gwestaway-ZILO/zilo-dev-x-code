#!/usr/bin/env node

/**
 * Simple test to verify the /init command logic works
 */

import { initCommand } from './packages/cli/dist/src/ui/commands/initCommand.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock the command context
const mockContext = {
  services: {
    config: {
      getTargetDir: () => process.cwd()
    }
  },
  ui: {
    addItem: (item, timestamp) => {
      console.log(`UI Item: ${item.text}`);
    }
  }
};

async function testInitCommand() {
  console.log('Testing /init command...');
  
  // Ensure no DevX.md exists
  const devxPath = path.join(process.cwd(), 'DevX.md');
  if (fs.existsSync(devxPath)) {
    fs.unlinkSync(devxPath);
    console.log('Removed existing DevX.md');
  }
  
  // Execute the init command
  const result = await initCommand.action(mockContext, '');
  
  console.log('Result type:', result.type);
  
  if (result.type === 'submit_prompt') {
    console.log('✅ /init command returns submit_prompt as expected');
    console.log('✅ DevX.md file created:', fs.existsSync(devxPath));
    console.log('✅ Prompt includes write_file instructions:', result.content.includes('write_file tool'));
    console.log('✅ Prompt includes correct file path:', result.content.includes(devxPath));
  } else {
    console.log('❌ Unexpected result type:', result);
  }
}

testInitCommand().catch(console.error);