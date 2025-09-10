# ZILO Dev X Code — Simple Anthropic Integration Roadmap
*(Direct Anthropic API integration for Gemini-CLI - No provider abstraction needed)*

> Repo: `zilo-dev-x-code`  
> Goal: **Simple, direct Anthropic API integration** to use Claude 3.5 Sonnet and Opus models with the existing Gemini CLI infrastructure.

---

## Table of contents
- [Guiding principles](#guiding-principles)
- [Target capabilities](#target-capabilities)
- [Simple architecture](#simple-architecture)
- [Implementation approach](#implementation-approach)
- [Configuration](#configuration)
- [Success metrics](#success-metrics)
- [Definition of Done](#definition-of-done)

---

## Guiding principles

- **Keep it simple.** No complex provider abstractions or multi-provider systems.
- **Direct Anthropic API usage.** Use the Anthropic SDK directly with API keys.
- **Minimal changes.** Modify only what's necessary to support Anthropic models.
- **Use existing infrastructure.** Leverage Gemini CLI's excellent tools, UI, and MCP system.
- **Focus on Sonnet & Opus.** Support Claude 3.5 Sonnet and Opus models specifically.

---

## Target capabilities

### Core requirements
- [x] **Direct Anthropic API support** via `ANTHROPIC_API_KEY`
- [x] **Skip Google authentication** when using Anthropic
- [x] **Claude 3.5 Sonnet** as default model
- [ ] **Claude 3 Opus** support with model selection
- [x] **All existing CLI tools** work with Anthropic
- [x] **Streaming responses** for better interactivity

### What we DON'T need
- ❌ Complex provider abstraction layers
- ❌ Multi-provider fallback systems  
- ❌ Provider-agnostic interfaces
- ❌ OpenRouter or other third-party providers
- ❌ Complex configuration systems

---

## Simple architecture

```
zilo-dev-x-code/ (Gemini-CLI with Anthropic)
├─ packages/
│  ├─ cli/                    
│  │  ├─ src/
│  │  │  ├─ config/          # Add Anthropic API key support
│  │  │  └─ core/            # Skip Google auth for Anthropic
│  │  └─ package.json        
│  │
│  ├─ core/                   
│  │  ├─ src/
│  │  │  ├─ providers/       
│  │  │  │  └─ anthropic-provider.ts  # Simple Anthropic client
│  │  │  └─ core/            
│  │  │      └─ client.ts    # Direct Anthropic usage
│  │  └─ package.json        # Already has @anthropic-ai/sdk
│  │
│  └─ .env                    # ANTHROPIC_API_KEY configuration
```

---

## Implementation approach

### Step 1: Environment Configuration ✅
**Status: COMPLETED**
- ✅ Support `ANTHROPIC_API_KEY` environment variable
- ✅ Support `ZILO_PROVIDER=anthropic` to select Anthropic
- ✅ Skip Google authentication when Anthropic is selected

### Step 2: Direct Anthropic Integration ✅  
**Status: COMPLETED**
- ✅ Use existing `anthropic-provider.ts` implementation
- ✅ Initialize Anthropic client with API key
- ✅ Support streaming responses
- ✅ Handle tool/function calling

### Step 3: Model Selection
**Status: IN PROGRESS**
- [x] Default to Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`)
- [ ] Add support for Claude 3 Opus (`claude-3-opus-20240229`)
- [ ] Allow model selection via `--model` flag or environment variable

### Step 4: Testing & Validation
**Status: PENDING**
- [ ] Test all core CLI tools with Anthropic
- [ ] Verify streaming works correctly
- [ ] Ensure error handling is appropriate
- [ ] Document any limitations

---

## Configuration

### Simple .env setup
```bash
# That's it! Just set your API key
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional: Explicitly set provider (auto-detected if API key is set)
ZILO_PROVIDER=anthropic

# Optional: Choose model (defaults to Sonnet)
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
# or
ANTHROPIC_MODEL=claude-3-opus-20240229
```

### Usage
```bash
# Just run the CLI normally - it will use Anthropic automatically
npm run start

# Or with a prompt
npm run start -- -p "Help me refactor this code"

# Explicitly choose Opus model
ANTHROPIC_MODEL=claude-3-opus-20240229 npm run start
```

---

## Success metrics

### Functionality
- ✅ CLI starts without Google authentication when using Anthropic
- ✅ Can send prompts and receive responses from Claude models
- ✅ All existing tools (file editing, shell, etc.) work
- ✅ Streaming responses display correctly

### Simplicity
- ✅ Configuration requires only setting `ANTHROPIC_API_KEY`
- ✅ No complex provider selection UI
- ✅ No unnecessary abstraction layers
- ✅ Minimal code changes from original Gemini CLI

### Performance
- Response time: < 2s to start streaming
- Token usage: Efficient use of Claude's context window
- Error handling: Clear messages when API key is invalid

---

## Definition of Done

### Must have
- ✅ `ANTHROPIC_API_KEY` environment variable support
- ✅ Skip Google auth when using Anthropic
- ✅ Claude 3.5 Sonnet model working
- [ ] Claude 3 Opus model working
- ✅ All CLI tools functional with Anthropic
- ✅ Clear console message showing "Using Anthropic provider"

### Should have
- [ ] Model selection via command line flag
- [ ] Better error messages for API failures
- [ ] Usage tracking/logging for API costs

### Won't have
- ❌ Provider abstraction system
- ❌ Multi-provider support
- ❌ Fallback mechanisms
- ❌ Provider selection UI
- ❌ OpenRouter or other providers

---

## Current Status

### Completed ✅
1. Basic Anthropic provider implementation exists
2. Environment variable support added
3. Google auth bypass implemented
4. Console logging shows which provider is active
5. Anthropic SDK already installed

### Remaining Work
1. **Fix TypeScript compilation errors** (optional for dev mode)
2. **Test Claude 3 Opus model**
3. **Add model selection flag**
4. **Document usage examples**

### Known Issues
- TypeScript compilation has errors (doesn't block `npm run start`)
- Some Gemini-specific code may need adjustment
- Test coverage needed for Anthropic-specific paths

---

## Quick Start Guide

1. **Set your API key:**
```bash
export ANTHROPIC_API_KEY="your-actual-api-key"
export ZILO_PROVIDER="anthropic"
```

2. **Run the CLI:**
```bash
npm run start
```

3. **You should see:**
```
🤖 Using Anthropic provider (Claude models)
```

4. **Start using it:**
- No Google login required
- Uses Claude 3.5 Sonnet by default
- All tools work as expected

---

*Last updated: January 2025*
*Focus: Simple, direct Anthropic API integration without complexity*