# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Gemini CLI - an open-source AI agent that brings Google Gemini directly into the terminal. It's a TypeScript monorepo using workspaces, with strict TypeScript configuration and ES modules throughout.

## Essential Commands

### Development
- `npm start` - Start development version
- `npm run build` - Build the project
- `npm run build:all` - Build everything (main, sandbox, vscode)

### Code Quality (Run these before committing)
- `npm run lint` - Check for linting issues
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Check TypeScript types
- `npm run preflight` - Complete validation suite (clean, ci, format, lint, build, typecheck, test)

### Testing
- `npm test` - Run all workspace tests
- `npm run test:e2e` - Run end-to-end integration tests
- Run specific test: `npm test -- path/to/test.test.ts`
- Run tests in watch mode: `npm test -- --watch`

## Architecture

### Package Structure
The codebase is organized as a monorepo with these key packages:

- **packages/cli**: Frontend/UI layer using React with Ink for terminal rendering. Entry point is `/packages/cli/index.ts`. Handles user interaction, command processing, and display.

- **packages/core**: Backend/business logic. Contains Gemini API client, tool orchestration, session management, and all built-in tools (file, shell, web, search).

- **packages/a2a-server**: Agent-to-Agent server for HTTP-based agent interactions with Google Cloud Storage integration.

- **packages/vscode-ide-companion**: VS Code extension for IDE integration capabilities.

### Key Architectural Patterns

**Tool System**: Tools are modular components in `packages/core/src/tools/`. Each tool extends the base Tool class and implements execute methods. Tools can be built-in or loaded via MCP protocol.

**Session Management**: Conversations are managed through session objects that handle state, history, and context. Sessions persist conversation history and can be resumed.

**Authentication**: Supports multiple auth methods (OAuth, API keys, Vertex AI) with a unified interface. Auth configuration is stored in user settings.

**React Terminal UI**: The CLI uses React components with Ink for rendering. Components are functional with hooks, following React best practices.

## Development Guidelines

### TypeScript Standards
- Never use `any` - use `unknown` with type narrowing instead
- Prefer plain objects over classes (except for tools and core abstractions)
- Use ES module encapsulation for privacy rather than class privates
- Strict TypeScript configuration is enforced

### Code Style
- Use hyphenated flag names (`my-flag` not `my_flag`)
- Prefer functional programming patterns with array operators
- Keep state immutable and isolate side effects
- Write high-value comments only - avoid verbose documentation in code

### Testing
- Tests use Vitest framework
- Unit tests are co-located with source files (`*.test.ts`)
- Integration tests are in `/integration-tests/`
- Mock external dependencies properly
- Focus on testing behavior, not implementation details

### React/Ink Components
- Use functional components with hooks
- Keep components pure when possible
- Handle terminal-specific concerns (colors, cursor, input)
- Components are in `packages/cli/src/components/`

## MCP (Model Context Protocol) Support

The project supports MCP for extensibility. MCP servers can be configured to add custom tools and capabilities. Configuration is stored in user settings and servers are loaded dynamically.

## File Operations

When working with files:
- The project uses ES modules (`"type": "module"` in package.json)
- Import paths need `.js` extensions even for TypeScript files
- Async/await is preferred over callbacks
- Use the built-in file tools for file operations within the agent

## Environment Requirements

- Node.js >= 20.0.0
- Optional: Docker or Podman for sandboxed execution
- Platform support: macOS, Linux, Windows