# Zilo Dev X CLI Roadmap (Claude Fork)

This is a fork of the [Official Gemini CLI](https://github.com/google-gemini/gemini-cli) that has been enhanced to support Anthropic's Claude models.

## Current Implementation Status

### ✅ Completed Features

#### Claude Model Integration
- **Full Claude API Support:** Complete integration with Anthropic's API using the `@anthropic-ai/sdk`
- **Model Support:** 
  - Claude Sonnet 4 (default: `claude-sonnet-4-20250514`)
  - Claude 3 Opus (`claude-3-opus-20240229`)
  - Claude 3.5 Haiku (`claude-3-5-haiku-20241022`)
- **Authentication:** Added "Use Claude API Key" option to auth dialog, supports `ANTHROPIC_API_KEY` environment variable
- **Auto-detection:** CLI automatically uses Claude when `ANTHROPIC_API_KEY` is set
- **Context Management:** Custom system prompts ensure Claude identifies itself correctly

#### Core Functionality
- **Streaming Responses:** Full support for streaming Claude responses
- **Token Counting:** Estimated token counting (Claude doesn't have direct API)
- **Tool/Function Calling:** Basic support for Claude's tool use format
- **All CLI Tools:** File operations, shell commands, code editing work seamlessly with Claude

### 🚧 In Progress / Planned

#### Enhanced Claude Features
- **Model Selection UI:** Add ability to switch between Claude models in runtime
- **Claude-specific Optimizations:** Leverage Claude's 200k context window more effectively
- **Improved Tool Calling:** Better integration with Claude's tool use patterns

#### Compatibility Layer
- **Dual Model Support:** Allow seamless switching between Claude and Gemini models
- **Embedding Fallback:** Automatically use Gemini for embeddings when needed
- **Unified Configuration:** Single config file for both Claude and Gemini settings

### ❌ Not Supported

- **Embeddings:** Claude doesn't support embeddings - use Gemini models for this
- **Image Generation:** Not available with Claude API

## Architecture Changes

The fork maintains backward compatibility while adding Claude support through:

1. **Content Generator Abstraction:** `claudeContentGenerator.ts` implements the same interface as Gemini
2. **Authentication Extension:** Added `USE_CLAUDE_API` auth type
3. **Model Configuration:** Extended to include Claude model definitions
4. **Message Format Translation:** Automatic conversion between Gemini and Claude formats

## Configuration

### Quick Start
1. Set your API key: `export ANTHROPIC_API_KEY="your-key"`
2. Run: `npm start`
3. Select "Use Claude API Key" when prompted

### Environment Variables
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `GEMINI_SYSTEM_MD`: Path to custom system prompt file
- `GEMINI_API_KEY`: Optional, for dual-model support

## Contributing

This fork welcomes contributions that:
- Improve Claude integration
- Add Claude-specific features
- Enhance the compatibility layer
- Fix bugs in the Claude implementation

Please ensure any changes maintain backward compatibility with the original Gemini CLI functionality.

## Original Gemini CLI Information

This fork is based on the Gemini CLI, an [Apache 2.0 open source project](https://github.com/google-gemini/gemini-cli). The original focuses on:

- **Power & Simplicity:** Intuitive command-line interface
- **Extensibility:** Adaptable agent for various use cases
- **Intelligent:** High performance on benchmarks
- **Free and Open Source:** Community-driven development

For information about the original Gemini CLI roadmap, see the [Official Roadmap](https://github.com/google-gemini/gemini-cli/issues/4191).

## License

This fork maintains the Apache 2.0 license of the original project.