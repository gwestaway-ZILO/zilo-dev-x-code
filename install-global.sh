#!/bin/bash

# DevX CLI Global Installation Script
# This script builds and installs DevX CLI globally on your system

set -e

echo "🔧 Building DevX CLI..."
npm run bundle

echo "📦 Installing DevX globally..."
npm link

echo "✅ DevX CLI installed successfully!"
echo ""
echo "You can now run 'devx' from any directory:"
echo "  devx --version"
echo "  devx --help"
echo "  devx init"
echo ""
echo "To uninstall later, run:"
echo "  npm unlink -g @google/gemini-cli"