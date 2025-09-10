# Quick Start Guide for Claude Integration

## Step 1: Set Your API Key

Edit the `.env` file in the project root and replace `your-anthropic-api-key-here` with your actual Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-ACTUAL-KEY-HERE
```

You can get your API key from: https://console.anthropic.com/account/keys

## Step 2: Run the CLI

```bash
npm start
```

## Step 3: Select Claude Authentication

When the authentication dialog appears, you'll now see:

1. Login with Google
2. **Use Claude API Key** ← Select this option (it should auto-select if ANTHROPIC_API_KEY is set)
3. Use Gemini API Key  
4. Vertex AI

Press Enter to select "Use Claude API Key".

## Step 4: Start Chatting

Once authenticated, you can start chatting with Claude 3.5 Sonnet (the default model).

Example prompts:
- "Hello! What model are you?"
- "Write a Python function to calculate fibonacci numbers"
- "Explain quantum computing in simple terms"

## Troubleshooting

If you get an authentication error:
1. Check that your API key is correctly set in `.env`
2. Ensure the API key starts with `sk-ant-`
3. Verify your API key is active on the Anthropic console

## Using Different Claude Models

Currently defaults to Claude 3.5 Sonnet. To use other models (Opus, Haiku), you would need to modify the model selection in the code or wait for configuration support to be added.

## Switching Between Claude and Gemini

To switch back to Gemini:
1. Set `GEMINI_API_KEY` in your `.env` file
2. Remove or comment out `ANTHROPIC_API_KEY`
3. Restart the CLI