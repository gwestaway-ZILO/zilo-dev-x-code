#!/bin/bash

# DevX CLI Reliable Global Installation Script
# This creates a direct executable instead of relying on npm link

set -e

echo "🔧 Building DevX CLI..."
npm run bundle

echo "📋 Creating global executable..."

# Get the absolute path to this directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVX_SCRIPT="$SCRIPT_DIR/devx"

# Create the devx executable script
cat > "$DEVX_SCRIPT" << 'EOF'
#!/usr/bin/env node

// DevX CLI Global Executable
// This script directly runs the bundled DevX CLI

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the bundled CLI
const bundlePath = join(__dirname, 'bundle', 'gemini.js');

// Import and run the CLI
import(bundlePath).catch(error => {
  console.error('Failed to start DevX CLI:', error.message);
  process.exit(1);
});
EOF

# Make it executable
chmod +x "$DEVX_SCRIPT"

# Create symlink in PATH - cross-platform detection
echo "🔗 Creating symlink in appropriate bin directory..."

# Detect appropriate bin directory
BIN_DIR=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS - check for different Homebrew locations
  if [[ -d "/opt/homebrew/bin" ]]; then
    BIN_DIR="/opt/homebrew/bin"  # Apple Silicon
  elif [[ -d "/usr/local/bin" ]]; then
    BIN_DIR="/usr/local/bin"     # Intel Mac
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux - use standard locations
  if [[ -d "/usr/local/bin" ]]; then
    BIN_DIR="/usr/local/bin"
  elif [[ -d "$HOME/.local/bin" ]]; then
    BIN_DIR="$HOME/.local/bin"
  fi
fi

# Create symlink if we found a suitable directory
if [[ -n "$BIN_DIR" && -w "$BIN_DIR" ]]; then
  ln -sf "$DEVX_SCRIPT" "$BIN_DIR/devx"
  echo "✅ Symlink created: $BIN_DIR/devx -> $DEVX_SCRIPT"
else
  echo "⚠️  Could not automatically create symlink. Manual setup required:"
  echo "   sudo ln -sf '$DEVX_SCRIPT' /usr/local/bin/devx"
  echo "   OR add the following to your shell profile:"
  echo "   export PATH=\"$SCRIPT_DIR:\$PATH\""
fi

echo "✅ DevX CLI installed successfully!"
echo ""
echo "🚀 New Multi-Agent Delegation System Available!"
echo "   Delegate complex tasks to multiple AI agents working in parallel"
echo ""
echo "Test it:"
echo "  devx --version"
echo "  devx --help"
echo "  devx init"
echo ""
echo "Try the new delegation features:"
echo "  devx"  # Enter interactive mode, then use:
echo "    /delegate \"add unit tests for all services\" --agents=3"
echo "    /delegate \"refactor authentication module\" --agents=2 --strategy=files"
echo "    /delegate report --open  # View detailed execution results"
echo ""
if [[ -n "$BIN_DIR" && -w "$BIN_DIR" ]]; then
  echo "📍 Installed to: $BIN_DIR/devx -> $DEVX_SCRIPT"
  echo ""
  echo "🔄 To update, re-run this script: ./install-devx-global.sh"
  echo "🗑️  To uninstall: rm $BIN_DIR/devx"
else
  echo "📍 DevX script created at: $DEVX_SCRIPT"
  echo "   Follow the manual setup instructions above to add to PATH"
  echo ""
  echo "🔄 To update, re-run this script: ./install-devx-global.sh"
fi