#!/usr/bin/env node

/**
 * Compare our Bedrock schema format with Anthropic's native API format
 * to identify potential schema format incompatibilities
 */

console.log('=== ANTHROPIC NATIVE API TOOL FORMAT ===');
// According to Anthropic docs, tools should be formatted like this:
const anthropicNativeFormat = {
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

console.log(JSON.stringify(anthropicNativeFormat, null, 2));

console.log('\n=== OUR BEDROCK FORMAT ===');
const ourBedrockFormat = {
  "name": "list_directory",
  "description": "Lists files in the specified directory. ALWAYS provide the 'path' parameter. For current directory use: {\"path\": \"/Users/gwestaway/Documents/workspace/zilo-dev-x-code\"}",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "REQUIRED: The absolute path to the directory to list. For current directory, use exactly: \"/Users/gwestaway/Documents/workspace/zilo-dev-x-code\"",
        "default": "/Users/gwestaway/Documents/workspace/zilo-dev-x-code",
        "example": "/Users/gwestaway/Documents/workspace/zilo-dev-x-code"
      }
    },
    "required": ["path"],
    "additionalProperties": false
  }
};

console.log(JSON.stringify(ourBedrockFormat, null, 2));

console.log('\n=== COMPARISON ANALYSIS ===');

// Compare key differences
console.log('Structural differences:');
console.log('1. Description length:', {
  anthropic: anthropicNativeFormat.description.length,
  ours: ourBedrockFormat.description.length
});

console.log('2. Property description complexity:', {
  anthropic: anthropicNativeFormat.input_schema.properties.path.description.length,
  ours: ourBedrockFormat.input_schema.properties.path.description.length
});

console.log('3. Extra schema fields in our version:');
const ourExtraFields = [];
for (const key in ourBedrockFormat.input_schema.properties.path) {
  if (!(key in anthropicNativeFormat.input_schema.properties.path)) {
    ourExtraFields.push(key);
  }
}
console.log('  -', ourExtraFields.join(', '));

console.log('4. Schema-level differences:');
const ourSchemaFields = Object.keys(ourBedrockFormat.input_schema);
const anthropicSchemaFields = Object.keys(anthropicNativeFormat.input_schema);
const extraSchemaFields = ourSchemaFields.filter(field => !anthropicSchemaFields.includes(field));
console.log('  - Extra fields:', extraSchemaFields);

console.log('\n=== POTENTIAL ISSUES ===');
console.log('1. ❌ "default" and "example" fields may confuse Claude');
console.log('2. ❌ "additionalProperties: false" may be too restrictive');
console.log('3. ❌ Description may be too verbose/complex');
console.log('4. ❌ Current working directory in description creates dynamic content');

console.log('\n=== SIMPLIFIED SCHEMA TEST ===');
// Test with a much simpler schema that matches Anthropic's native format exactly
const simplifiedSchema = {
  "name": "list_directory",
  "description": "Lists files in a directory",
  "input_schema": {
    "type": "object", 
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to directory"
      }
    },
    "required": ["path"]
  }
};

console.log('Simplified schema (closer to Anthropic native):');
console.log(JSON.stringify(simplifiedSchema, null, 2));

console.log('\n=== BEDROCK SPECIFIC INVESTIGATION ===');
console.log('Known Bedrock Claude issues:');
console.log('1. Tool calling may behave differently than native Anthropic API');
console.log('2. Schema validation may be more strict');
console.log('3. JSON schema interpretation may differ');
console.log('4. Model versions may have different tool calling capabilities');

console.log('\n=== HYPOTHESIS ===');
console.log('The schema we\'re sending is TOO complex for Bedrock Claude to parse correctly.');
console.log('Claude may be receiving it but unable to understand the schema format.');
console.log('This would explain why Claude sends empty {} - it knows it should call the tool');
console.log('but doesn\'t understand what parameters to provide.');

console.log('\n=== RECOMMENDED FIXES ===');
console.log('1. Simplify schema to match Anthropic native format exactly');
console.log('2. Remove "default", "example", and "additionalProperties" fields');
console.log('3. Shorten descriptions significantly'); 
console.log('4. Test with minimal schema first, then gradually add complexity');