# devx Agents Roadmap

Design a first-class **Agents** experience in `devx` CLI—mirroring Claude Code’s ergonomics (`/agent` to pick/switch; project/user-scoped agents on disk)—while **leveraging existing Gemini CLI capabilities** (MCP discovery, tool registry, provider adapters).

---

## Objectives
- Introduce **agent definitions** as Markdown + YAML front-matter stored at project and user scope.
- Provide an **interactive `/agent` UX** (list, select, create, edit, delete, run).
- Reuse and extend **Gemini CLI** infrastructure: MCP servers, tool registry, provider shims (Gemini & Claude via Bedrock).
- Enforce **permissions & precedence** (user < project) without sacrificing developer velocity.
- Support **agent memory**, optional **imports**, and future **autodelegation**.
- Keep provider specifics behind **adapters** so agents behave consistently across models.

---

## What we’re matching (behavioral parity)
- “Subagent” model: a lightweight profile consisting of **name**, **description**, **tools allowlist**, and a **system prompt**.
- Agents selected at runtime via `/agent`, with project- and user-level storage.
- Clear separation between **memory/rules** and **operational settings/permissions**.
- Tool usage controlled by strong descriptions and allow/deny rules.
- Optional “diff/patch” edit flows via editor tools (or your own `apply_patch` APIs).

---

## File & Directory Layout

```
.devx/
  settings.json          # project settings (permissions, mcpServers, defaults)
  agents/
    code-reviewer.md     # agent file (YAML front-matter + prompt body)
    release-bot.md
~/.devx/
  settings.json          # user-wide settings
  agents/
    test-runner.md
```

**Agent file format (Markdown + YAML front-matter):**

```md
---
name: code-reviewer                # unique id (kebab-case recommended)
description: >
  Expert code review specialist. Use proactively after writing or modifying code.
tools: [Read, Grep, Glob, Bash]    # optional; omit ⇒ inherits all allowed tools
model: gemini-2.5-pro-1m           # optional; overrides global default
provider: gemini                   # gemini | claude | openai (optional)
memory: agent-memory.md            # optional; included at session start
---
You are a senior code reviewer. When invoked:
1) Run `git diff` to focus on modified files.
2) Check security, tests, and performance considerations.
3) Propose actionable fixes with concrete diffs or patch instructions.
```

> **Precedence:** If an agent `name` exists in both scopes, **project** wins.  
> **Memory:** If specified, the file is appended to the agent’s system prompt at session start.

---

## Milestone 1 — Agent Schema & Loader (CORE)

**Deliverables**
- YAML front-matter parser for `.md` files; body becomes the **system prompt**.
- `AgentLoader` that merges project and user agents with **project > user** precedence.
- Validation: unknown keys warn; `name` and `description` required.

**Acceptance Tests**
- `loadAgents()` returns a merged map; duplicates resolve to project versions.
- Missing `tools` means **inherit** from the active tool registry (post-permission filtering).

---

## Milestone 2 — `/agent` UX (TUI + Commands)

**Commands**
- `devx /agent` → interactive picker (use `fzf` if present; fallback to Node TUI).
- `devx /agent use <name>` → switch current session agent.
- `devx /agent create` → guided wizard writes `.devx/agents/<name>.md`.
- `devx /agent edit <name>` → open in `$EDITOR`.
- `devx /agent rm <name>` → delete (with `--scope project|user` if ambiguous).
- `devx /agent run <name> "<prompt>"` → one-shot invocation with that agent.

**Session Model**
- The session holds `{ agentId, provider, model, toolsScope }`.
- Switching agent reloads **system prompt**, **memory include**, and **tool allowlist**.

**Acceptance Tests**
- Switching updates provider/model if set in front-matter.
- Denied tools do not appear for that agent.

---

## Milestone 3 — Settings, Permissions, and MCP Reuse

**Config Shapes**
- `~/.devx/settings.json` (user) and `.devx/settings.json` (project), merged as **user < project**.
- Recommended keys:

```json
{
  "permissions": {
    "allow": ["Bash(npm run test:*)"],
    "deny": ["Read(./secrets/**)"]
  },
  "mcpServers": {
    "example": { "command": "node", "args": ["dist/server.js"], "trust": true }
  },
  "defaultAgent": "code-reviewer"
}
```

**Behavior**
- Keep using Gemini CLI’s **MCP discovery** (stdio/SSE/HTTP).  
- At runtime, the **active tool registry** is filtered by global/project `permissions`, then the agent’s `tools` allowlist (if present).

**Acceptance Tests**
- An agent with `tools: ["Grep","Read"]` only exposes those (plus MCP tools that pass filters).
- Project settings override user settings (e.g., different default agent).

---

## Milestone 4 — Provider Adapters & Tool Bridging (Gemini + Claude)

**Problem:** Providers expect different tool schemas and return different call shapes.  
**Solution:** Keep a **provider-agnostic internal tool schema**, translate at send-time, and parse each provider’s response correctly.

**Internal Tool Schema**
```ts
type InternalTool = {
  name: string;
  description: string;        // very explicit “when to use” guidance
  jsonSchema: Record<string, any>;  // JSON Schema input (type: object, required: [])
};
```

**Mapping**
```ts
// Gemini
function toGeminiTools(tools: InternalTool[]) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema
    }))
  }];
}

// Claude (via Bedrock)
function toClaudeTools(tools: InternalTool[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema
  }));
}
```

**Dispatch Loop (pseudocode)**
```ts
if (provider === "gemini") {
  // look for response.functionCalls[]
  // execute, then send follow-up with tool outputs
} else if (provider === "claude") {
  // look for assistant.content[].type === "tool_use" and stop_reason === "tool_use"
  // reply with user.content[] of { type: "tool_result", tool_use_id, content }
}
```

**Acceptance Tests**
- Same agent runs on **both providers**, reading/writing files.
- Parallel tool calls are handled deterministically (ID → result mapping).

---

## Milestone 5 — Memory & Bootstrapping

- **Agent memory** (`memory:` file) is concatenated to the system prompt at session start.
- `/agent init` scaffolds an agent with recommended sections: Responsibilities, When to use, Tooling, Guardrails, Example prompts.
- Optional **`@imports`** lines inside the agent body to include shared snippets (e.g., `@~/.devx/snippets/security.md`). Detect and warn on cycles.

**Acceptance Tests**
- Editing memory updates behavior without restarting the CLI.
- Import cycles are caught with a clear error.

---

## Milestone 6 — Autodelegation & Chaining (Optional)

- **Autodelegation:** On freeform prompts, score agents by fuzzy match on `description` and recent context; suggest/auto-invoke top agent under a threshold (opt-in).
- **Chaining:** `devx /agent run code-analyzer "find perf hotspots" then optimizer "apply fixes"`.

**Acceptance Tests**
- Autodelegation suggests reasonable agents and can be declined.
- Chaining executes agents in order and passes artifacts/prompts between them.

---

## Milestone 7 — IDE Surfaces (Optional)

- Expose a lightweight **ACP adapter** so Zed (or others) can host your agents visually (diffs, patch review, accept/modify).

---

## Minimal Implementation Details

**Types**
```ts
type AgentDef = {
  name: string;
  description: string;
  tools?: string[];
  model?: string;                         // e.g., "gemini-2.5-pro-1m"
  provider?: "gemini" | "claude" | "openai";
  memory?: string;                        // relative path to md
  prompt: string;                         // body markdown (system prompt)
};
```

**Resolution**
```ts
const PROJECT_DIR = path.join(cwd, ".devx/agents");
const USER_DIR = path.join(os.homedir(), ".devx/agents");

function loadAgents(): Record<string, AgentDef> {
  // read .md files from both dirs, parse front-matter, merge with project > user precedence
}
```

**Provider Choice**
- Fallback order: `agent.model/provider` → project settings → user settings.
- Provide flags to override per-run: `devx --provider=claude --model=... /agent use code-reviewer`.

**Permissions**
- Apply global/project `permissions` first, then filter by agent’s `tools` allowlist.
- Provide clear error messages when a requested tool is denied.

**Tool Descriptions (Important)**
- Write long, explicit **descriptions** with “when to use” and examples. This dramatically improves model tool selection.

---

## Acceptance Checklist (End-to-End)

1. `devx /agent` shows both scopes; switching updates provider/model and tool allowlist.  
2. Agents with no `tools` field inherit the filtered registry (incl. MCP tools).  
3. Same `/agent run code-reviewer "review my diff"` works on **Gemini and Claude**, including file reads/writes.  
4. Denied paths (e.g., `./secrets/**`) are not readable regardless of agent.  
5. Editing an agent file hot-reloads in the picker; memory is included without restart.  
6. Optional: Autodelegation proposes an agent and can be toggled.

---

## Starter Agents (Templates)

- **code-reviewer** — Read, Grep, Glob, Bash  
- **test-runner** — Bash, Read, Write  
- **docs-writer** — Read, Write, WebFetch  
- **release-bot** — Bash, Write (guarded by permissions)

---

## Risks & Mitigations

- **Provider drift** → Keep adapters thin; unit-test recorded fixtures for both response shapes.  
- **Tool overreach** → Strong defaults: inherit tools but encourage per-agent allowlists; enforce global `deny`.  
- **User friction** → `/agent create` wizard and templates to avoid blank-page syndrome.

---

## Appendix — CLI Command Reference (v1)

```
devx /agent                     # interactive picker
devx /agent use <name>          # set current session agent
devx /agent run <name> "<p>"    # run one-shot with agent
devx /agent create              # wizard to scaffold agent
devx /agent edit <name>         # open agent in $EDITOR
devx /agent rm <name>           # remove agent (ask scope if ambiguous)
```

**Flags**
- `--provider <p>` / `--model <m>` → override front-matter/settings for the run.
- `--scope project|user` → target directory for create/remove.
- `--dry-run` → show tool calls without executing.
