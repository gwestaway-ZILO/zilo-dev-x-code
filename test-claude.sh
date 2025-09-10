#!/bin/bash

# Test script for Claude integration
echo "Testing Claude API integration..."

# Export the Anthropic API key (you'll need to replace this with your actual key)
export ANTHROPIC_API_KEY="your_api_key_here"

# Test basic interaction
echo "Hello, Claude!" | npm start

echo "Test complete. Check if the response was generated successfully."