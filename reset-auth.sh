#!/bin/bash

# Script to reset Gemini CLI authentication

echo "Resetting Gemini CLI authentication..."

# Try to clear various possible auth storage locations
rm -rf ~/.gemini-cli/auth 2>/dev/null
rm -rf ~/.gemini-cli/settings.json 2>/dev/null
rm -rf ~/.config/gemini-cli/auth 2>/dev/null
rm -rf ~/.config/gemini-cli/settings.json 2>/dev/null

# Clear any local project settings
rm -rf .gemini-cli 2>/dev/null

echo "Authentication reset. Run 'npm start' to reconfigure."