#!/bin/bash

# DevX CLI Installation and PATH Fix Script

set -e

echo "🔧 Building DevX CLI..."
npm run bundle

echo "📦 Installing DevX globally..."
npm unlink -g 2>/dev/null || true
npm link

echo "🔍 Checking installation..."
DEVX_PATH=$(which devx 2>/dev/null || echo "")

if [ -n "$DEVX_PATH" ]; then
    echo "✅ DevX CLI installed successfully at: $DEVX_PATH"
    devx --version
else
    echo "⚠️  DevX installed but not found in PATH"
    
    # Get npm global bin directory
    NPM_PREFIX=$(npm config get prefix)
    NPM_BIN="$NPM_PREFIX/bin"
    
    echo "NPM global bin directory: $NPM_BIN"
    
    # Check if it's in PATH
    if [[ ":$PATH:" != *":$NPM_BIN:"* ]]; then
        echo ""
        echo "🔧 PATH Fix Required:"
        echo "Add this line to your ~/.zshrc (or ~/.bashrc):"
        echo ""
        echo "export PATH=\"$NPM_BIN:\$PATH\""
        echo ""
        echo "Then run: source ~/.zshrc"
        echo ""
        echo "Or run this command now:"
        echo "echo 'export PATH=\"$NPM_BIN:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
    fi
fi

echo ""
echo "📋 Usage:"
echo "  devx --version"
echo "  devx init"
echo "  devx"
echo ""
echo "🔄 To update later, run this script again: ./install-and-fix-path.sh"