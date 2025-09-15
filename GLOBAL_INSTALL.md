# DevX CLI Global Installation

## ✅ Installation Complete

DevX CLI is now installed globally on your system and can be run from any terminal with the `devx` command.

## Quick Start

```bash
# Check version
devx --version

# Get help
devx --help

# Initialize DevX.md file in current project
devx init

# Start interactive session
devx

# Run with a specific prompt
devx "Explain this codebase"

# Start with YOLO mode (auto-approve all actions)
devx --yolo
```

## Configuration

DevX CLI will automatically look for configuration files in:
- Current project: `DevX.md`
- User global: `~/.devx/DEVX.md`
- Legacy global: `~/.gemini/DevX.md`

## Environment Variables

Add these to your `~/.zshrc`, `~/.bashrc`, or equivalent:

```bash
# Required for Claude/Anthropic models
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Optional: AWS credentials for Bedrock
export AWS_ACCESS_KEY_ID="your-aws-access-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
export AWS_REGION="us-east-1"

# Optional: Custom system prompt
export GEMINI_SYSTEM_MD="./system.md"
```

## Performance Optimizations

This build includes several performance optimizations:
- Memory composition caching (10-second TTL)
- Content deduplication with LRU cache
- Response optimization for terminal display
- Fast-path memory composition for simple operations
- Performance monitoring with timing logs

## Updating

To update DevX CLI after making changes:

```bash
cd /path/to/zilo-dev-x-code
npm run bundle
npm link
```

Or use the provided script:

```bash
./install-global.sh
```

## Uninstalling

To remove DevX CLI globally:

```bash
npm unlink -g @google/gemini-cli
```

## Troubleshooting

If the `devx` command is not found:
1. Make sure npm's global bin directory is in your PATH
2. Check with: `npm config get prefix`
3. Add `$(npm config get prefix)/bin` to your PATH if needed

## Support

- Version: 0.4.0
- Node.js: >= 20.0.0 required
- Platform: macOS, Linux, Windows supported