#!/usr/bin/env node

/**
 * Direct test of Bedrock API to isolate the tool calling issue
 * This bypasses all our framework code and tests Claude directly
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({
  region: process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
});

// Test with the absolute minimal request that should work
const testRequest = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1000,
  messages: [
    {
      role: 'user',
      content: 'List the files in the current directory'
    }
  ],
  system: 'You are a helpful assistant. Use the list_directory tool to list files.',
  tools: [
    {
      name: 'list_directory',
      description: 'Lists files in a directory',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path'
          }
        },
        required: ['path']
      }
    }
  ]
};

console.log('=== TESTING DIRECT BEDROCK API CALL ===');
console.log('Request:');
console.log(JSON.stringify(testRequest, null, 2));

async function testBedrockDirect() {
  try {
    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(testRequest),
    });

    console.log('\nSending request to Bedrock...');
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log('\n=== BEDROCK RESPONSE ===');
    console.log(JSON.stringify(responseBody, null, 2));

    // Analyze the response
    console.log('\n=== ANALYSIS ===');
    console.log('Response type:', responseBody.type);
    console.log('Stop reason:', responseBody.stop_reason);
    console.log('Content blocks:', responseBody.content.length);
    
    responseBody.content.forEach((content, index) => {
      console.log(`Content ${index}:`, content.type);
      if (content.type === 'tool_use') {
        console.log(`  Tool: ${content.name}`);
        console.log(`  Input:`, JSON.stringify(content.input, null, 2));
        console.log(`  ID: ${content.id}`);
        
        if (!content.input || Object.keys(content.input).length === 0) {
          console.log('  ❌ EMPTY TOOL INPUT DETECTED!');
        } else {
          console.log('  ✅ Tool input provided');
        }
      } else if (content.type === 'text') {
        console.log(`  Text: ${content.text.substring(0, 100)}...`);
      }
    });

  } catch (error) {
    console.error('Error calling Bedrock:', error);
  }
}

// Run the test
testBedrockDirect();