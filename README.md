# DevX CLI

[![License](https://img.shields.io/github/license/google-gemini/gemini-cli)](https://github.com/google-gemini/gemini-cli/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/version-0.4.0-blue)](https://github.com/google-gemini/gemini-cli)

![DevX CLI Screenshot](./docs/assets/gemini-screenshot.png)

**DevX CLI** is an advanced, multi-provider AI command-line interface adapted from Google's Gemini CLI to support **Claude models via AWS Bedrock** and **Anthropic API**, alongside existing Gemini support. It features a powerful **Agent System** for specialized AI personas with controlled tool access - perfect for enterprise environments and focused workflows.

## 🚀 Why DevX CLI?

- **🤖 Multi-Provider AI**: Support for **Claude 4 Sonnet**, **Claude 3.5 Sonnet/Haiku** via AWS Bedrock + Anthropic API, plus full Gemini support
- **👥 Agent System**: Create specialized AI personas with **restricted tool access** and custom system prompts ✨ **NEW**
- **🔧 Comprehensive Tools**: File operations, shell commands, web fetching, advanced search, and more
- **🛡️ Enterprise Ready**: Granular tool access control perfect for security-conscious environments
- **🔌 Extensible**: MCP (Model Context Protocol) support for custom integrations
- **💻 Terminal-first**: Designed for developers who live in the command line
- **🚀 Open source**: Apache 2.0 licensed with active development

## 📦 Installation

### Build from Source

**DevX CLI** is currently available as a source build while we prepare official distribution packages.

```bash
# Clone the repository
git clone https://github.com/your-org/devx-cli
cd devx-cli

# Install dependencies and build
npm install
npm run build

# Run the CLI
npm start
# or use the built binary
./bundle/gemini.js
```

#### System Requirements

- Node.js version 20 or higher
- macOS, Linux, or Windows
- For AWS Bedrock: Valid AWS credentials with Bedrock access

## 🏗️ Development Status

DevX CLI is actively developed with focus on:

- **Multi-Provider AI Integration**: Robust support for Claude models via AWS Bedrock and Anthropic API
- **Agent System**: Specialized AI personas with controlled tool access
- **Enterprise Features**: Security, compliance, and audit capabilities
- **Tool Ecosystem**: Comprehensive built-in tools with MCP extensibility

For detailed technical information, see [CURRENT_IMPLEMENTATION_STATUS.md](./CURRENT_IMPLEMENTATION_STATUS.md).

## 📋 Key Features

### Multi-Provider AI Support

- **Latest Claude Models**: Claude 4 Sonnet, Claude 3.5 Sonnet v2, Claude 3.5 Haiku via AWS Bedrock
- **Direct Anthropic API**: Connect directly to Claude API for simple setup
- **Gemini Compatibility**: Full backward compatibility with original Gemini CLI features
- **Intelligent Model Selection**: Automatic model routing based on task complexity

### Agent System ✨ NEW

- **Specialized AI Personas**: Create focused agents for specific tasks (security analysis, code review, documentation)
- **Tool Access Control**: Restrict agents to only the tools they need for security and focus
- **Custom System Prompts**: Define agent behavior and expertise areas
- **Workspace & User Agents**: Personal and project-specific agent libraries
- **Agent Management**: Full lifecycle management with `/agent` commands

### Code Understanding & Generation

- Query and edit large codebases with Claude's superior reasoning
- Generate new applications with detailed architectural understanding
- Debug complex issues with Claude's advanced problem-solving capabilities
- Multi-file operations with intelligent context management

### Enterprise & Security Features

- **Granular Access Control**: Restrict tool access per agent for security compliance
- **AWS Integration**: Enterprise-grade authentication and billing via AWS Bedrock
- **Audit Trail**: Track agent actions and tool usage for compliance
- **Sandboxed Execution**: Safe tool execution with proper isolation

### Advanced Capabilities

- **Agent-Aware Tools**: Tools that adapt behavior based on active agent
- **Conversation Checkpointing**: Save and resume complex multi-agent sessions
- **Custom Context Files**: Project-specific behavior with DevX.md files
- **MCP Integration**: Extend capabilities with Model Context Protocol servers

### GitHub Integration

Integrate Gemini CLI directly into your GitHub workflows with [**Gemini CLI GitHub Action**](https://github.com/google-github-actions/run-gemini-cli):

- **Pull Request Reviews**: Automated code review with contextual feedback and suggestions
- **Issue Triage**: Automated labeling and prioritization of GitHub issues based on content analysis
- **On-demand Assistance**: Mention `@gemini-cli` in issues and pull requests for help with debugging, explanations, or task delegation
- **Custom Workflows**: Build automated, scheduled and on-demand workflows tailored to your team's needs

## 🔐 Authentication Options

DevX CLI supports multiple AI providers. Choose the authentication method that best fits your needs:

### Option 1: AWS Bedrock (Recommended for Claude models)

**✨ Best for:** Teams wanting Claude 4 Sonnet, Claude 3.5 Sonnet/Haiku with enterprise AWS infrastructure

**Benefits:**

- **Latest Claude Models**: Claude 4 Sonnet, Claude 3.5 Sonnet v2, Claude 3.5 Haiku
- **Enterprise Security**: AWS IAM integration and compliance
- **Scalable**: Enterprise-grade rate limits and billing
- **Agent System**: Full support for specialized AI personas with tool restrictions

```bash
# Set your AWS credentials
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export AWS_REGION="us-east-1"  # or your preferred region

# Start DevX CLI - will auto-detect AWS credentials
devx
```

### Option 2: Claude API (Direct Anthropic)

**✨ Best for:** Direct access to Claude models via Anthropic

**Benefits:**

- **Direct API Access**: Connect directly to Anthropic's Claude API
- **Simple Setup**: Just an API key required
- **Agent System**: Full agent support with tool filtering

```bash
# Get your key from https://console.anthropic.com/
export ANTHROPIC_API_KEY="YOUR_API_KEY"
devx
```

### Option 3: Google OAuth/Gemini (Legacy Support)

**✨ Best for:** Existing Gemini CLI users wanting to transition gradually

**Benefits:**

- **Backward Compatibility**: All original Gemini CLI features
- **Free Tier Available**: Google's free tier limits
- **Familiar Interface**: Same experience as original Gemini CLI

```bash
# Set your Gemini API key or use OAuth
export GEMINI_API_KEY="YOUR_API_KEY"
# or for OAuth
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_NAME"
devx
```

For detailed authentication setup, see the [authentication guide](./docs/cli/authentication.md).

## 🚀 Getting Started

### Basic Usage

#### Start in current directory

```bash
devx
```

#### Include multiple directories

```bash
devx --include-directories ../lib,../docs
```

#### Use specific Claude model via Bedrock

```bash
devx -m claude-sonnet-4-20250514
```

#### Non-interactive mode for scripts

```bash
devx -p "Explain the architecture of this codebase"
```

### Agent System ✨ NEW

Create specialized AI personas with controlled tool access:

#### List available agents

```bash
devx
> /agent list
```

#### Create a new agent

```bash
devx
> /agent create code-reviewer
# Follow interactive prompts to define tools and system prompt
```

#### Switch to an agent

```bash
devx
> /agent use code-reviewer
# Agent now has restricted tool access as defined
```

#### Agent Definition Example

Create `.devx/agents/security-analyst.md`:

```yaml
---
name: security-analyst
description: Security-focused agent for code analysis
model: claude-3-5-sonnet
tools: ["read_file", "search_file_content", "list_directory"]
---

You are a security analyst specialized in finding security vulnerabilities.
Focus on identifying potential security issues, authentication problems,
and unsafe coding practices. Be thorough but concise in your analysis.
```

### Quick Examples

#### Start a new project with DevX CLI

```bash
cd new-project/
devx
> Write me a Discord bot using Claude that answers questions from a FAQ.md file
```

#### Analyze existing code with a specialized agent

```bash
git clone https://github.com/your-org/your-project
cd your-project
devx
> /agent use security-analyst
> Analyze this codebase for potential security vulnerabilities
```

## 📚 Documentation

### Getting Started

- [**Quickstart Guide**](./docs/cli/index.md) - Get up and running quickly
- [**Authentication Setup**](./docs/cli/authentication.md) - Detailed auth configuration
- [**Configuration Guide**](./docs/cli/configuration.md) - Settings and customization
- [**Keyboard Shortcuts**](./docs/keyboard-shortcuts.md) - Productivity tips

### Core Features

- [**Commands Reference**](./docs/cli/commands.md) - All slash commands (`/help`, `/chat`, `/mcp`, etc.)
- [**Checkpointing**](./docs/checkpointing.md) - Save and resume conversations
- [**Memory Management**](./docs/tools/memory.md) - Using GEMINI.md context files
- [**Token Caching**](./docs/cli/token-caching.md) - Optimize token usage

### Tools & Extensions

- [**Built-in Tools Overview**](./docs/tools/index.md)
  - [File System Operations](./docs/tools/file-system.md)
  - [Shell Commands](./docs/tools/shell.md)
  - [Web Fetch & Search](./docs/tools/web-fetch.md)
  - [Multi-file Operations](./docs/tools/multi-file.md)
- [**MCP Server Integration**](./docs/tools/mcp-server.md) - Extend with custom tools
- [**Custom Extensions**](./docs/extension.md) - Build your own commands

### Advanced Topics

- [**Architecture Overview**](./docs/architecture.md) - How Gemini CLI works
- [**IDE Integration**](./docs/ide-integration.md) - VS Code companion
- [**Sandboxing & Security**](./docs/sandbox.md) - Safe execution environments
- [**Enterprise Deployment**](./docs/deployment.md) - Docker, system-wide config
- [**Telemetry & Monitoring**](./docs/telemetry.md) - Usage tracking
- [**Tools API Development**](./docs/core/tools-api.md) - Create custom tools

### Configuration & Customization

- [**Settings Reference**](./docs/cli/configuration.md) - All configuration options
- [**Theme Customization**](./docs/cli/themes.md) - Visual customization
- [**.gemini Directory**](./docs/gemini-ignore.md) - Project-specific settings
- [**Environment Variables**](./docs/cli/configuration.md#environment-variables)

### Troubleshooting & Support

- [**Troubleshooting Guide**](./docs/troubleshooting.md) - Common issues and solutions
- [**FAQ**](./docs/troubleshooting.md#frequently-asked-questions) - Quick answers
- Use `/bug` command to report issues directly from the CLI

### Using MCP Servers

Configure MCP servers in `~/.gemini/settings.json` to extend Gemini CLI with custom tools:

```text
> @github List my open pull requests
> @slack Send a summary of today's commits to #dev channel
> @database Run a query to find inactive users
```

See the [MCP Server Integration guide](./docs/tools/mcp-server.md) for setup instructions.

## 🤝 Contributing

We welcome contributions! DevX CLI is fully open source (Apache 2.0), building on Google's excellent Gemini CLI foundation. We encourage the community to:

- **Agent Templates**: Share specialized agent definitions for common use cases
- **Report bugs and suggest features**: Help us improve multi-provider AI support
- **Improve documentation**: Especially for the new Agent System
- **Submit code improvements**: Focus on Claude integration and agent capabilities
- **Share MCP servers**: Extend functionality with custom tools

See our [Contributing Guide](./CONTRIBUTING.md) for development setup, coding standards, and how to submit pull requests.

### Development Areas

- **Agent System Enhancements**: Templates, chaining, dynamic permissions
- **Claude Model Optimization**: Improve performance and reduce costs
- **Enterprise Features**: Advanced security, audit logging, role-based access
- **Tool Development**: Agent-aware tools and specialized integrations

## 📖 Resources

- **[Official Roadmap](./ROADMAP.md)** - See what's coming next
- **[NPM Package](https://www.npmjs.com/package/@google/gemini-cli)** - Package registry
- **[GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)** - Report bugs or request features
- **[Security Advisories](https://github.com/google-gemini/gemini-cli/security/advisories)** - Security updates

### Uninstall

See the [Uninstall Guide](docs/Uninstall.md) for removal instructions.

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Terms of Service**: [Terms & Privacy](./docs/tos-privacy.md)
- **Security**: [Security Policy](SECURITY.md)

---

<p align="center">
  <strong>DevX CLI</strong> - Multi-Provider AI for Developers<br/>
  Built with ❤️ on Google's Gemini CLI foundation<br/>
  Enhanced with Claude models, Agent System, and Enterprise features
</p>

## ⚡ Quick Start Summary

```bash
# 1. Build from source
git clone https://github.com/your-org/devx-cli && cd devx-cli
npm install && npm run build

# 2. Set up AWS Bedrock for Claude models
export AWS_ACCESS_KEY_ID="your_key"
export AWS_SECRET_ACCESS_KEY="your_secret" 
export AWS_REGION="us-east-1"

# 3. Run DevX CLI
devx

# 4. Try the Agent System
> /agent list
> /agent create my-specialist
> /agent use my-specialist
```

**Need Help?** Check the [CURRENT_IMPLEMENTATION_STATUS.md](./CURRENT_IMPLEMENTATION_STATUS.md) for detailed technical information and the latest features.
