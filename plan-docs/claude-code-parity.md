# DevX CLI — Claude Code Parity Checklist (Updated 2025-09-12)

This checklist maps **Claude Code parity** work onto the **current DevX CLI state** you shared.  
Legend: ✅ Done · 🟡 Partial · ⬜ Not started

---

## TL;DR status snapshot

| Area | Status | Notes |
|---|---|---|
| Agents (create/use/list/edit/delete/show/clear) | ✅ | Implemented with tool allowlists + chat reset enforcement. |
| Multi‑provider (Gemini, Claude API, Bedrock) | ✅ | Streaming + tool param accumulation fixed for Bedrock. |
| Built‑in tools (FS/Search/Web/Shell/Memory) | ✅ | 12+ tools working; path validation fix in `ls`. |
| MCP integration | ✅ | Discovery & dynamic registration working. |
| **Memory layering + `/init`** | ⬜ | Not in status doc; add project/user `DEVX.md` + imports. |
| **Safe patch flow (diff/approve/apply)** | 🟡 | VS Code extension has diff handling; CLI needs `apply_patch` tool + review loop. |
| Provider adapters (tool schema + response loops) | 🟡 | Works generally; add fixtures & parallel `tool_use` mapping tests. |
| GitHub PR review/action | ⬜ | Provide Action + CLI entrypoints for review/apply. |
| Shell & path guardrails (trust prompts) | 🟡 | Basic path validation exists; add risky shell confirmations + central policy. |
| Selection‑aware edits / LSP assist | ⬜ | Add `edit_range` + (optional) symbol→range helper. |
| Codebase indexing & retrieval | ⬜ | Add lightweight index + `code_context` tool. |
| Autodelegation (agent suggest/route) | ⬜ | Score & suggest best agent (opt‑in). |
| IDE parity bumps (agent switcher/status) | 🟡 | VS Code ext present; add agent/model status bar + QuickPick. |
| Audit & approvals / Evals | ⬜ | Approval workflow, JSONL audit, eval suite. |

---

## P0 — Must‑have for parity

### 1) Project/User memory + `/init` ⬜
**Why:** Claude bootstraps repo rules into a memory file and layers user/project scopes.

**Deliver**
- `.devx/DEVX.md` (project) and `~/.devx/DEVX.md` (user) with precedence **project > user**.
- `/init` wizard: scaffold `DEVX.md` (Build/Test, Style, Dir map, Key workflows, `@imports`).
- Import syntax in body: one-per-line `@path/to/file.md` with cycle detection.

**Wire‑up**
- `packages/core/src/config/memory.ts` (new) — compose memory → prepend to system prompt.
- `packages/cli/src/ui/commands/initCommand.ts` (new).

**Accept**
- On session start, prompt includes layered memory (+ active agent memory if present).
- `/init` offers **open/merge/replace/abort** if file exists.

---

### 2) Editor‑grade patch loop (diff → approve → apply) 🟡
**Why:** Claude proposes diffs and applies only on approval.

**What you have**
- VS Code extension with **diff handling** (good foundation).

**Gaps/Deliver**
- `apply_patch` tool (unified diff) + `preview_patch`.
- CLI **DiffViewer** with Approve/Reject/Modify; supports multi‑file patches.
- Prefer diffs in `SmartEditTool` outputs when feasible.

**Wire‑up**
- `packages/core/src/tools/apply-patch.ts` (new).
- `packages/cli/src/ui/components/DiffViewer.tsx` (new).
- Extend `smart_edit` to emit unified diffs.

**Accept**
- Model can propose multi‑file diffs; user approves to write.
- Conflict path yields clear guidance (retry/rebase).

---

### 3) Provider adapters: schema + response loops 🟡
**Why:** Claude vs Gemini tool schemas & call shapes differ.

**What you have**
- Fixed Bedrock streaming arg accumulation; tools working across providers.

**Gaps/Deliver**
- Harden **internal→provider** tool translators (Gemini `functionDeclarations` vs Claude `input_schema`).
- Robust response loop:
  - Gemini: `functionCalls[]`.
  - Claude: `assistant.content[].type === "tool_use"` → immediate `user.tool_result[]`.
- **Parallel** calls mapping by `tool_use_id`.

**Wire‑up**
- `packages/core/src/core/bedrockContentGenerator.ts` + `claudeContentGenerator.ts` + `geminiContentGenerator.ts`.
- Test fixtures covering single + parallel calls.

**Accept**
- Same prompt produces tool calls and file writes on both providers.
- Parallel `tool_use` handled deterministically.

---

### 4) GitHub PR review/action ⬜
**Why:** Claude Code parity for repo workflows.

**Deliver**
- CLI subcommands: `devx ci review`, `devx ci apply` (uses `apply_patch`).
- `action.yml` + `.github/devx.yml` (model/agent/globs/safety) for easy adoption.

**Wire‑up**
- `packages/cli/src/ci/prReview.ts` (new).
- Minimal templates in repo.

**Accept**
- On PR open/update: structured review comment; optional patch commit on approval.

---

### 5) Shell & path guardrails 🟡
**What you have**
- Path validation fix in `ls`; denylists implied in settings.

**Gaps/Deliver**
- Risk prompts for **mutating** shell commands (package installs, network side effects).
- Central **path policy** applied to all FS tools (deny secrets, outside repo).

**Wire‑up**
- `packages/core/src/tools/run-shell-command.ts` — confirmation prompts & allow/deny patterns.
- `packages/core/src/config/settings.ts` — canonical path policy.

**Accept**
- Dangerous shell requests require explicit user approval.
- Denied paths are consistently blocked & logged.

---

## P1 — Strong parity

### 6) Selection‑aware edits & LSP assist ⬜
- `edit_range` tool: `{ path, startLine, endLine, replacement }`.
- Optional lightweight LSP helper (TS/JS) for symbol→range.

**Accept:** Precise edits without rewriting whole files.

---

### 7) Codebase indexing & retrieval ⬜
- Build mini index (`rg`, heuristics) in `.devx/cache/`.
- `code_context` tool: return top‑k files/snippets for a query.

**Accept:** Model naturally pulls the right context with minimal token spend.

---

### 8) Autodelegation to best agent ⬜
- Score agents by `description` + recent turns; suggest or auto‑route (opt‑in).
- `/pref set autodelegate true|false`.

**Accept:** Freeform prompts get a relevant agent suggestion that can be declined.

---

### 9) VS Code parity bumps 🟡
- Status bar shows **active agent/model**.
- QuickPick to **switch agent**.
- Ensure diff panel integrates with `apply_patch` approval.

**Accept:** Full agent & patch flow inside IDE.

---

## P2 — Delight / enterprise

### 10) Audit, approvals, and evals ⬜
- JSONL **audit log** for tool calls (with redaction).
- **Approval workflows** for high‑risk actions (write outside repo, net ops).
- Evals: `npm run eval` → scorecard for fix‑its/refactors/docs; CI gate toggle.

---

## File anchors & owners (suggested)

- Memory: `core/config/memory.ts` (new) — *owner:* Core  
- Patch flow: `core/tools/apply-patch.ts` (new), `cli/ui/components/DiffViewer.tsx` — *owners:* Tools + CLI  
- Providers: `core/*ContentGenerator.ts`, `tools/tool-registry.ts` — *owner:* Core  
- CI/PR: `cli/src/ci/prReview.ts`, `action.yml` — *owner:* CLI  
- Safety: `core/tools/run-shell-command.ts`, `core/config/settings.ts` — *owner:* Tools

---

## Test plan essentials

- **Providers:** fixtures for Gemini `functionCalls[]` and Claude `tool_use` (incl. parallel).  
- **Patch flow:** single & multi‑file; conflict + revert.  
- **Agents:** precedence (workspace > user), allowlist enforcement after **chat reset**, hot‑reload (if added).  
- **Memory:** layered composition + `@imports` cycles.  
- **Safety:** deny rules & risk prompts.  
- **CI:** PR opened → review comment + optional patch commit path.

---

## Quick wins to ship next
1) `/init` + memory loader (layered).  
2) `apply_patch` + CLI diff approval.  
3) Provider loop tests incl. **parallel** `tool_use`.  
4) Minimal GitHub Action using your CLI.
