#!/usr/bin/env node

/**
 * Debug script to analyze Bedrock tool schema conversion
 * This simulates the schema conversion process without making actual AWS API calls
 */

import { LSTool } from './packages/core/dist/src/tools/ls.js';

// Mock config object
const mockConfig = {
  getTargetDir: () => process.cwd(),
  getWorkspaceContext: () => ({
    isPathWithinWorkspace: () => true,
    getDirectories: () => [process.cwd()]
  }),
  getFileService: () => ({
    shouldGitIgnoreFile: () => false,
    shouldGeminiIgnoreFile: () => false
  }),
  getFileFilteringOptions: () => ({
    respectGitIgnore: true,
    respectGeminiIgnore: true
  })
};

// Create LSTool instance
const lsTool = new LSTool(mockConfig);

// Get the tool schema
const toolSchema = lsTool.schema;

console.log('=== ORIGINAL GEMINI TOOL SCHEMA ===');
console.log(JSON.stringify(toolSchema, null, 2));

// Simulate the Bedrock conversion process from bedrockContentGenerator.js
function convertToolToBedrock(tool) {
  let name, description, originalSchema;
  
  if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length > 0) {
    // Gemini format: { functionDeclarations: [{ name, description, parametersJsonSchema }] }
    const funcDecl = tool.functionDeclarations[0];
    name = funcDecl.name;
    description = funcDecl.description || '';
    originalSchema = funcDecl.parametersJsonSchema || funcDecl.parameters || {};
  } else {
    // Direct tool format: { name, description, parameters }
    name = tool.name;
    description = tool.description || '';
    originalSchema = tool.parameters || {};
  }

  if (!name) {
    console.warn('Tool is missing name, skipping:', tool);
    return null;
  }

  // Ensure the schema has required Bedrock fields
  let input_schema = {
    type: 'object',
    properties: originalSchema.properties || {},
    required: originalSchema.required || [],
    ...originalSchema
  };

  // Special handling for list_directory to ensure Claude understands it
  if (name === 'list_directory') {
    input_schema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `REQUIRED: The absolute path to the directory to list. For current directory, use exactly: "${process.cwd()}"`,
          default: process.cwd(),
          example: process.cwd()
        }
      },
      required: ['path'],
      additionalProperties: false
    };
    description = `Lists files in the specified directory. ALWAYS provide the 'path' parameter. For current directory use: {"path": "${process.cwd()}"}`;
  }

  // Ensure required array exists for Bedrock compatibility
  if (!Array.isArray(input_schema.required)) {
    input_schema.required = [];
  }

  return {
    name,
    description,
    input_schema
  };
}

// Convert the tool schema to Bedrock format
console.log('\n=== BEDROCK CONVERSION PROCESS ===');

// First, wrap it in a tool array as it would appear in the request
const toolsArray = [{ functionDeclarations: [toolSchema] }];
console.log('Tools array structure:');
console.log(JSON.stringify(toolsArray, null, 2));

// Convert each tool
const bedrockTools = toolsArray.map(convertToolToBedrock).filter(Boolean);

console.log('\n=== CONVERTED BEDROCK TOOL SCHEMA ===');
console.log(JSON.stringify(bedrockTools, null, 2));

console.log('\n=== COMPARISON WITH ANTHROPIC NATIVE ===');
const anthropicNative = {
  "name": "list_directory",
  "description": "Lists files in the specified directory",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The absolute path to the directory to list"
      }
    },
    "required": ["path"]
  }
};

const ourSchema = bedrockTools[0];
console.log('Anthropic native format:');
console.log(JSON.stringify(anthropicNative, null, 2));
console.log('\nOur simplified format:');
console.log(JSON.stringify(ourSchema, null, 2));

console.log('\n=== SCHEMA MATCHING ANALYSIS ===');
const nativeDesc = anthropicNative.description;
const ourDesc = ourSchema?.description || '';
const nativePathDesc = anthropicNative.input_schema.properties.path.description;
const ourPathDesc = ourSchema?.input_schema?.properties?.path?.description || '';

console.log('Description match:', nativeDesc === ourDesc ? '✅' : '❌', `(${nativeDesc.length} vs ${ourDesc.length} chars)`);
console.log('Path description match:', nativePathDesc === ourPathDesc ? '✅' : '❌', `(${nativePathDesc.length} vs ${ourPathDesc.length} chars)`);
console.log('Schema structure match:', JSON.stringify(anthropicNative.input_schema) === JSON.stringify(ourSchema?.input_schema) ? '✅' : '❌');

// Check for exact match
const isExactMatch = JSON.stringify(anthropicNative) === JSON.stringify(ourSchema);
console.log('Exact format match:', isExactMatch ? '✅ PERFECT MATCH' : '❌ Still different');

// Simulate the complete Bedrock request structure
const mockBedrockRequest = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 4096,
  messages: [
    {
      role: 'user',
      content: `List the files in the current directory using the list_directory tool with the absolute path "${process.cwd()}"`
    }
  ],
  system: 'You are an interactive CLI agent. When asked to list files in the current directory, use the list_directory tool like this: Call list_directory with parameter: {"path": "' + process.cwd() + '"}. NEVER call tools with empty parameters {}.',
  tools: bedrockTools
};

console.log('\n=== COMPLETE BEDROCK REQUEST STRUCTURE ===');
console.log(JSON.stringify(mockBedrockRequest, null, 2));

console.log('\n=== ANALYSIS ===');
console.log('Tool name:', bedrockTools[0]?.name);
console.log('Required fields:', bedrockTools[0]?.input_schema?.required);
console.log('Properties:', Object.keys(bedrockTools[0]?.input_schema?.properties || {}));
console.log('Path description:', bedrockTools[0]?.input_schema?.properties?.path?.description);
console.log('Tool description:', bedrockTools[0]?.description);

console.log('\n=== SCHEMA VALIDATION TEST ===');
// Test what happens when Claude sends empty parameters
const emptyParams = {};
const expectedParams = { path: process.cwd() };

console.log('Empty params (what Claude sends):', JSON.stringify(emptyParams));
console.log('Expected params:', JSON.stringify(expectedParams));
console.log('Schema requires:', bedrockTools[0]?.input_schema?.required);
console.log('Schema properties:', Object.keys(bedrockTools[0]?.input_schema?.properties || {}));

// Check if the schema is actually being followed
const hasRequiredPath = bedrockTools[0]?.input_schema?.required?.includes('path');
const hasPathProperty = 'path' in (bedrockTools[0]?.input_schema?.properties || {});

console.log('\n=== SCHEMA ANALYSIS ===');
console.log('Schema has path as required field:', hasRequiredPath);
console.log('Schema has path property definition:', hasPathProperty);
console.log('Schema additionalProperties setting:', bedrockTools[0]?.input_schema?.additionalProperties);

if (!hasRequiredPath || !hasPathProperty) {
  console.log('❌ POTENTIAL ISSUE: Schema may not be properly constructed');
} else {
  console.log('✅ Schema appears properly constructed');
  console.log('🤔 Issue likely in Claude\'s interpretation or Bedrock API handling');
}