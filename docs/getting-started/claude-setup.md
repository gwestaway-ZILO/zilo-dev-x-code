# Claude Integration for Gemini CLI

This fork adds support for Anthropic's Claude models (Sonnet and Opus) to the Gemini CLI.

## Setup

1. Get your Anthropic API key from https://console.anthropic.com/

2. Set the environment variable:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

   Or add it to your `.env` file:
   ```
   ANTHROPIC_API_KEY=your-api-key-here
   ```

## Usage

Once you have set your `ANTHROPIC_API_KEY`, the CLI will automatically detect it and use Claude models instead of Gemini.

### Default Model
By default, the CLI will use Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`).

### Available Models
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet (default, best balance of capability and speed)
- `claude-3-opus-20240229` - Claude 3 Opus (most capable, slower)
- `claude-3-5-haiku-20241022` - Claude 3.5 Haiku (fastest, most economical)

### Specifying a Model
You can specify a different Claude model in your configuration or via command line options (once implemented).

## Features

- ✅ Text generation
- ✅ Multi-turn conversations
- ✅ Streaming responses
- ✅ Token counting (estimated)
- ✅ Tool/function calling (basic support)
- ❌ Embeddings (not supported by Claude - will fall back to Gemini if needed)
- ⚠️ Image support (limited - Claude has different requirements)

## Differences from Gemini

1. **Authentication**: Uses `ANTHROPIC_API_KEY` instead of `GEMINI_API_KEY`
2. **Models**: Uses Claude models instead of Gemini models
3. **Embeddings**: Not supported - you'll need to use Gemini for embedding operations
4. **Token Limits**: Claude has different token limits (typically up to 200k context)
5. **Pricing**: Different pricing model - check Anthropic's pricing page

## Troubleshooting

### API Key Not Found
If you see an error about the API key not being found, ensure:
1. The `ANTHROPIC_API_KEY` environment variable is set
2. The key is valid and has appropriate permissions
3. You've restarted your terminal or reloaded your environment

### Rate Limiting
Claude has different rate limits than Gemini. If you encounter rate limiting:
1. Check your usage on the Anthropic console
2. Consider upgrading your plan if needed
3. Implement appropriate retry logic in your scripts

## Development

The Claude integration is implemented through:
- `packages/core/src/core/claudeContentGenerator.ts` - Main Claude API client
- `packages/core/src/core/contentGenerator.ts` - Updated factory with Claude support
- `packages/core/src/config/models.ts` - Claude model definitions
- `packages/cli/src/config/auth.ts` - Authentication validation for Claude API

To add new Claude features or models, update these files accordingly.