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

# Create symlink in PATH
echo "🔗 Creating symlink in /opt/homebrew/bin..."
ln -sf "$DEVX_SCRIPT" /opt/homebrew/bin/devx

echo "✅ DevX CLI installed successfully!"
echo ""
echo "Test it:"
echo "  devx --version"
echo "  devx --help"
echo "  devx init"
echo ""
echo "📍 Installed to: /opt/homebrew/bin/devx -> $DEVX_SCRIPT"
echo ""
echo "🔄 To update, re-run this script: ./install-devx-global.sh"
echo "🗑️  To uninstall: rm /opt/homebrew/bin/devx"