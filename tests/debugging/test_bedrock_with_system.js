#!/usr/bin/env node

/**
 * Test Bedrock with the exact system prompt from our CLI to see what Claude returns
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import fs from 'fs';

const client = new BedrockRuntimeClient({
  region: process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
});

// Read the exact system prompt our CLI is using
const systemPrompt = fs.readFileSync('./system.md', 'utf8');
console.log('=== SYSTEM PROMPT FROM system.md ===');
console.log(systemPrompt);
console.log('=== END SYSTEM PROMPT ===\n');

// Test with the exact same request structure as our CLI
const testRequest = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1000,
  messages: [
    {
      role: 'user',
      content: 'List the files in the current directory.'
    }
  ],
  system: systemPrompt,
  tools: [
    {
      name: 'list_directory',
      description: 'Lists files in a directory',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to directory'
          }
        },
        required: ['path']
      }
    }
  ]
};

console.log('=== TESTING WITH CLI SYSTEM PROMPT ===');

async function testWithSystemPrompt() {
  try {
    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(testRequest),
    });

    console.log('Sending request to Bedrock...');
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log('\n=== BEDROCK RESPONSE ===');
    console.log(JSON.stringify(responseBody, null, 2));

    // Analyze specifically for tool calls
    console.log('\n=== TOOL CALL ANALYSIS ===');
    const toolCalls = responseBody.content.filter(c => c.type === 'tool_use');
    
    if (toolCalls.length > 0) {
      console.log(`✅ Claude made ${toolCalls.length} tool calls:`);
      toolCalls.forEach((tc, index) => {
        console.log(`\nTool Call ${index + 1}:`);
        console.log(`  Name: ${tc.name}`);
        console.log(`  ID: ${tc.id}`);
        console.log(`  Input: ${JSON.stringify(tc.input, null, 2)}`);
        
        if (!tc.input || Object.keys(tc.input).length === 0) {
          console.log(`  ❌ EMPTY INPUT - This is the problem!`);
        } else {
          console.log(`  ✅ Input provided correctly`);
        }
      });
    } else {
      console.log('❌ No tool calls made');
    }

    // Check text responses
    const textBlocks = responseBody.content.filter(c => c.type === 'text');
    if (textBlocks.length > 0) {
      console.log(`\n📝 Text responses:`);
      textBlocks.forEach((block, index) => {
        console.log(`Text ${index + 1}: ${block.text.substring(0, 200)}...`);
      });
    }

  } catch (error) {
    console.error('Error calling Bedrock:', error);
  }
}

// Run the test
testWithSystemPrompt();