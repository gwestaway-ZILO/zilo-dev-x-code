# DevX.md

## Project Overview

**DevX CLI** is an AI-powered command-line interface that has been adapted from the original Google Gemini CLI to work with Claude/Anthropic models alongside existing Gemini support. This TypeScript monorepo provides a unified interface to multiple AI providers with comprehensive built-in tools for development workflows.

### Core Technologies
- **Language**: TypeScript with strict configuration and ES modules
- **Runtime**: Node.js >=20.0.0
- **Architecture**: Monorepo with npm workspaces
- **UI Framework**: React with Ink for terminal rendering
- **Build Tools**: ESBuild for bundling, npm scripts for orchestration
- **Testing**: Vitest for unit/integration testing
- **Package Manager**: npm with lock file
- **Binary Name**: `devx` (not `gemini`)

### Multi-Provider AI Support
- 🎯 **Gemini**: OAuth, API key, and Vertex AI support
- 🧠 **Claude**: Direct Anthropic API and AWS Bedrock integration
- 🔧 **Built-in Tools**: 12+ tools including file ops, shell, web search, memory
- 🔌 **Extensible**: MCP (Model Context Protocol) for custom integrations
- 💻 **Terminal-first**: Designed for developers who live in the command line
- 🛡️ **Open source**: Apache 2.0 licensed

### Authentication Methods Supported
| Provider | Auth Type | Environment Variables | Status |
|----------|-----------|----------------------|---------|
| Google OAuth | `oauth-personal` | - | ✅ Working |
| Gemini API | `gemini-api-key` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | ✅ Working |
| Vertex AI | `vertex-ai` | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | ✅ Working |
| Cloud Shell | `cloud-shell` | - | ✅ Working |
| Claude API | `claude-api-key` | `ANTHROPIC_API_KEY` | ✅ Working |
| AWS Bedrock | `aws-bedrock` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | ✅ Recently Fixed |

## Essential Commands

### Development
```bash
# Start development version
npm start

# Start with debugging
npm run debug

# Start A2A server for agent interactions
npm run start:a2a-server

# Build and start
npm run build-and-start
```

### Build & Deployment
```bash
# Build main project
npm run build

# Build all packages (main, sandbox, VSCode extension)
npm run build:all

# Build individual components
npm run build:packages      # All workspace packages
npm run build:sandbox       # Sandbox container
npm run build:vscode        # VSCode companion

# Bundle for distribution
npm run bundle
```

### Testing & Quality
```bash
# Run all tests
npm test

# Run integration tests
npm run test:e2e
npm run test:integration:all

# Sandbox-specific testing
npm run test:integration:sandbox:none
npm run test:integration:sandbox:docker
npm run test:integration:sandbox:podman

# Code quality checks
npm run lint              # ESLint checking
npm run lint:fix          # Auto-fix issues
npm run format            # Prettier formatting
npm run typecheck         # TypeScript validation

# Complete validation suite (pre-commit)
npm run preflight         # clean + ci + format + lint + build + typecheck + test
```

### Makefile Commands
```bash
# Convenience commands via Make
make help                 # Show all available commands
make install              # npm install
make build                # Build project
make test                 # Run tests
make preflight            # Full validation
make start                # Start CLI
make debug                # Debug mode
make run-npx              # Test via npx
make create-alias         # Create shell alias
```

## Architecture

### Project Structure
```
/
├── packages/
│   ├── cli/              # Frontend/UI (React + Ink) - Entry: index.ts
│   ├── core/             # Backend/business logic - AI clients, tools, sessions
│   ├── a2a-server/       # Agent-to-Agent HTTP server with GCS integration
│   ├── vscode-ide-companion/  # VS Code extension for IDE integration
│   └── test-utils/       # Shared testing utilities
├── integration-tests/    # E2E and integration tests
├── scripts/              # Build and utility scripts
├── docs/                 # Comprehensive documentation
├── bundle/               # ESBuild output directory (contains devx binary)
└── .github/              # CI/CD workflows and templates
```

### Key Components

#### packages/cli
- **Purpose**: Terminal UI and user interaction layer
- **Tech**: React components with Ink rendering
- **Entry Point**: `packages/cli/index.ts`
- **Key Areas**:
  - UI components: `packages/cli/src/ui/components/`
  - Command handlers: `packages/cli/src/ui/commands/`
  - Authentication UI: `packages/cli/src/ui/auth/`
  - Configuration: `packages/cli/src/config/`

#### packages/core
- **Purpose**: Business logic and AI provider integration
- **Entry Point**: `packages/core/index.ts`
- **Key Areas**:
  - Content generators: `packages/core/src/core/` (Bedrock, Claude, Gemini)
  - Built-in tools: `packages/core/src/tools/` (12+ tools)
  - Services: `packages/core/src/services/`
  - Configuration: `packages/core/src/config/`

#### packages/a2a-server
- **Purpose**: Agent-to-Agent communication server
- **Features**: HTTP endpoints, task execution, Google Cloud Storage persistence

#### packages/vscode-ide-companion
- **Purpose**: IDE integration capabilities
- **Features**: File management, diff handling, IDE server communication

### AI Content Generators

#### BedrockContentGenerator
- **File**: `packages/core/src/core/bedrockContentGenerator.ts`
- **Purpose**: AWS Bedrock Claude integration
- **Models**: Claude 4 Sonnet, Claude 3.5 Sonnet/Haiku, Claude 3 series
- **Recent Fix**: ✅ Fixed streaming tool input accumulation bug

#### ClaudeContentGenerator
- **File**: `packages/core/src/core/claudeContentGenerator.ts`
- **Purpose**: Direct Anthropic API integration
- **Status**: ✅ Working for direct Claude API access

#### LoggingContentGenerator
- **File**: `packages/core/src/core/loggingContentGenerator.ts`
- **Purpose**: Logging wrapper for debugging content generation
- **Status**: ✅ Working

### Built-in Tools System

#### File System Tools (12+ tools total)
| Tool | Purpose | Status | Recent Fixes |
|------|---------|--------|--------------|
| `list_directory` | Lists files and directories | ✅ | Fixed relative path validation |
| `read_file` | Reads file contents | ✅ | Working |
| `write_file` | Creates/modifies files | ✅ | Working |
| `read_many_files` | Batch file reading | ✅ | Working |
| `edit_file` | Basic file editing | ✅ | Working |
| `smart_edit` | LLM-assisted editing | ✅ | Working |

#### Search & Pattern Tools
| Tool | Purpose | Status |
|------|---------|--------|
| `search_file_content` | Grep-based search | ✅ |
| `rg_search` | Advanced ripgrep search | ✅ |
| `glob` | File pattern matching | ✅ |

#### Web & System Tools
| Tool | Purpose | Status |
|------|---------|--------|
| `web_fetch` | Fetch web content | ✅ |
| `web_search` | Google web search | ✅ |
| `run_shell_command` | Execute shell commands | ✅ |
| `save_memory` | Session memory management | ✅ |

## Development Guidelines

### Code Standards

**TypeScript Best Practices**
- Strict TypeScript configuration enforced across all packages
- Never use `any` - prefer `unknown` with type narrowing
- Plain objects over classes (except tools and core abstractions)
- ES module encapsulation (`"type": "module"`) with `.js` import extensions

**Code Style Conventions**
- Hyphenated flag names (`--my-flag` not `--my_flag`)
- Functional programming patterns with array operators
- Immutable state management with isolated side effects
- High-value comments only, avoid verbose documentation

### Testing Strategy

**Testing Framework**: Vitest with coverage reporting
- **Unit Tests**: Co-located with source files (`*.test.ts`)
- **Integration Tests**: Separate directory `/integration-tests/`
- **Key Test Areas**: File system ops, shell commands, MCP integration
- **Test Philosophy**: Behavior testing over implementation details

**Testing Commands by Type**
```bash
# Specific test execution
npm test -- path/to/test.test.ts
npm test -- --watch                    # Watch mode
npm run test:ci                         # CI with coverage

# Integration test suites
npm run test:integration:sandbox:none   # No sandbox
npm run test:integration:sandbox:docker # Docker sandbox
npm run test:integration:sandbox:podman # Podman sandbox
```

### Git Workflow

**Branch Strategy**: Feature branches with main trunk
**Commit Standards**: Conventional commits preferred
**Code Review**: Required via pull requests
**Pre-commit**: Run `npm run preflight` before commits

## Configuration

### Environment Variables
```bash
# Gemini/Google Authentication
GEMINI_API_KEY="your_api_key"           # Direct Gemini API
GOOGLE_API_KEY="your_vertex_key"        # Vertex AI
GOOGLE_CLOUD_PROJECT="project_name"     # GCP project
GOOGLE_CLOUD_LOCATION="us-central1"     # GCP region
GOOGLE_GENAI_USE_VERTEXAI=true         # Enable Vertex AI

# Claude/Anthropic Authentication  
ANTHROPIC_API_KEY="your_anthropic_key"  # Direct Claude API

# AWS Bedrock Authentication
AWS_ACCESS_KEY_ID="your_aws_key"        # AWS access key
AWS_SECRET_ACCESS_KEY="your_aws_secret" # AWS secret
AWS_REGION="us-east-1"                  # AWS region

# Development Settings
DEBUG=1                                 # Enable debug mode
VERBOSE=true                            # Verbose output
KEEP_OUTPUT=true                        # Preserve test output
GEMINI_SANDBOX=docker                   # Sandbox type (docker/podman/false)
```

### Model Configuration
**File**: `packages/core/src/config/models.ts`
- **Gemini Models**: Various Gemini model configurations
- **Default Claude Model**: `DEFAULT_CLAUDE_MODEL` for Anthropic API
- **Default Bedrock Model**: `claude-sonnet-4-20250514` for AWS Bedrock

### Build Configuration

**ESBuild Setup** (`esbuild.config.js`)
- Entry point: `packages/cli/index.ts`
- Output: `bundle/gemini.js` (binary named `devx`)
- Platform: Node.js ESM format
- External dependencies: node-pty variants for terminal support
- Metafile generation for bundle analysis

### MCP (Model Context Protocol) Support

**Configuration**: `~/.gemini/settings.json` or `~/.devx/settings.json`
**Purpose**: Custom tool and server integration
**Usage Examples**:
```
> @github List my open pull requests
> @slack Send summary to #dev channel  
> @database Query inactive users
```

## Recent Critical Fixes

### 1. AWS Bedrock Streaming Fix ✅
**Issue**: BedrockContentGenerator wasn't properly accumulating tool input parameters from streaming responses
**Symptom**: Tool calls received empty `{}` arguments, causing execution failures
**Fix**: Implemented proper JSON chunk accumulation in streaming method
**File**: `packages/core/src/core/bedrockContentGenerator.ts`

### 2. Relative Path Validation Fix ✅
**Issue**: LSTool was rejecting relative paths like "." that AI models naturally provide
**Symptom**: Path validation errors when listing current directory
**Fix**: Added conversion of relative to absolute paths before validation
**File**: `packages/core/src/tools/ls.ts`

### 3. Tool Architecture Improvements ✅
**Enhancement**: Improved tool registry and MCP integration
**Files**: `packages/core/src/tools/tool-registry.ts`, `packages/core/src/tools/tools.ts`

## Troubleshooting

### Common Issues

**Authentication Problems**
- **Multiple Providers**: Ensure correct environment variables for chosen provider
- **AWS Bedrock**: Verify AWS credentials and region configuration
- **Claude API**: Check `ANTHROPIC_API_KEY` is set correctly
- **Gemini**: Confirm OAuth login or API key setup

**Build Problems**
- **Node Version**: Ensure Node.js >=20.0.0
- **Dependencies**: Run `npm ci` for clean install
- **TypeScript**: Check `npm run typecheck` for type errors
- **ES Modules**: Verify `.js` extensions in import paths

**Runtime Errors**
- **Tool Execution**: Check individual tool logs and parameters
- **Streaming Issues**: Recently fixed in Bedrock generator
- **Path Problems**: Recently fixed relative path handling
- **Sandbox**: Check Docker/Podman availability for sandboxed execution

### Development Tips

**Performance Optimization**
- Use token caching for API efficiency
- Leverage built-in tools for file operations
- Configure MCP servers for project-specific capabilities

**Debugging Strategies**
- Use `npm run debug` for Node.js inspector
- Enable verbose logging with environment variables
- Check integration tests for expected behavior patterns
- Use LoggingContentGenerator wrapper for AI interactions

**Multi-Provider Development**
- Test with different AI providers to ensure compatibility
- Understand model-specific capabilities and limitations
- Use appropriate models for different task types

## Additional Resources

### Documentation Links
- [**Architecture Overview**](./docs/architecture.md) - System design details
- [**CLI Commands Reference**](./docs/cli/commands.md) - Complete command list
- [**MCP Integration Guide**](./docs/tools/mcp-server.md) - Custom tool development
- [**Troubleshooting Guide**](./docs/troubleshooting.md) - Common issues and solutions
- [**Current Implementation Status**](./CURRENT_IMPLEMENTATION_STATUS.md) - Detailed technical status

### External Dependencies
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [AWS Bedrock Claude](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude.html)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [React + Ink Terminal UI](https://github.com/vadimdemedes/ink)

### Repository Information
- **GitHub**: https://github.com/google-gemini/gemini-cli (original)
- **NPM Package**: @google/gemini-cli (adapted for DevX)
- **License**: Apache 2.0
- **Binary**: `devx` (not `gemini`)
- **Version**: 0.4.0

### Team Contacts
- **Contributing**: See CONTRIBUTING.md for development guidelines
- **Roadmap**: Check ROADMAP.md for planned features
- **Implementation Status**: See CURRENT_IMPLEMENTATION_STATUS.md for technical details
- **Support**: Use `/bug` command in CLI or GitHub Issues