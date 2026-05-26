# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An MCP server that exposes a **local Ollama model as a technical-advisor tool** inside Claude Code,
plus a Claude Code skill that drives it with discipline. The design premise: a small local model is
weaker than a frontier model, so its value is **independence** (it never saw your reasoning, so its
blind spots don't overlap with yours), not capability. It pressure-tests a decision; it does not make it.

## Two pieces that work together

1. **The MCP server** (`server.js`) — a single-file stdio MCP server registering one tool, `consult`,
   which POSTs a system prompt + question (+ optional context) to Ollama's `/api/chat` and returns
   `message.content`. It is self-contained: only `@modelcontextprotocol/sdk` and `zod`.
2. **The `local-advisor` skill** (`skills/local-advisor/SKILL.md`) — pure Markdown; no code. It turns
   the raw `consult` tool into a sycophancy-resistant consultation workflow.

The server works standalone; the skill is an optional layer on top. The exposed tool is
`mcp__ollama__consult`. The two are **distributed separately** — `setup.ps1` installs the server at
Claude Code **user scope** (available in every project, no per-project step); the skill is copied
into `~/.claude/skills/` by hand. The code in this repo is the source of truth for both, but neither
runs from this checkout once installed.

## Commands

```sh
npm install              # install deps (server + tests)
node test-client.mjs     # end-to-end smoke test: spawns server over stdio, lists tools, calls consult
npm run lint:skill       # structural lint of skills/local-advisor/SKILL.md
./setup.ps1              # Windows/PowerShell one-shot bootstrap (idempotent): deps, model pull, register, smoke test
```

There is no build step (plain ESM, `"type": "module"`) and no unit-test runner — `test-client.mjs`
is the test. To lint an arbitrary skill file: `node scripts/lint-skill.mjs <path>`.

## Non-obvious behaviors to preserve

- **`consult` never throws.** HTTP errors and an unreachable Ollama return an MCP result with
  `isError: true` and a human-readable message, not an exception. Keep this contract.
- **`gemma4` emits a separate `thinking` field; the tool intentionally returns only `message.content`.**
  Don't surface chain-of-thought.
- **Latency tuning is deliberate:** `keep_alive: "30m"` keeps the model resident between calls, and
  `REQUEST_TIMEOUT_MS = 300_000` absorbs ~60s cold loads. `test-client.mjs` overrides the SDK's 60s
  default for the same reason.
- **The smoke test asserts on output, not just exit code.** `test-client.mjs` exits 0 even when the
  tool returns `isError: true`, so `setup.ps1` greps for `IS_ERROR: false` to avoid a false PASS.
  Preserve that assertion if you change either file.
- **Config is env-driven:** `OLLAMA_HOST` (default `http://localhost:11434`) and
  `OLLAMA_ADVISOR_MODEL` (default `gemma4:26b`). Both `server.js` and `setup.ps1` read them.
  `OLLAMA_ADVISOR_NUM_CTX` (unset by default) sets the context window; when unset the request
  omits `num_ctx` entirely so Ollama uses its own default. The `consult` tool also takes optional
  `model` and `num_ctx` args that override the env defaults per call. A per-machine default belongs
  in the registration, not the code (the safe size depends on the GPU's VRAM) — `setup.ps1 -NumCtx
  <tokens>` writes `OLLAMA_ADVISOR_NUM_CTX` into the `claude mcp add` registration.

## The consultation discipline (the skill's whole point)

A weak model consulted naively just agrees with you. The skill (`SKILL.md`) enforces:

- **Adversarial by default** — when you have a conclusion, hand it over and command the advisor to
  *assume you are wrong and find the most likely failure point*. A failure-search, not a "review."
- **Open mode** — with no conclusion yet, pose the decision and constraints but withhold any answer
  you're leaning toward, so you don't anchor it.
- **Neutralize platform jargon before calling** — the model has never seen Claude Code; terms like
  *MCP*, *hook*, *subagent* get silently reinterpreted. Spell them out in plain words.
- **Adjudicate, don't defer** — treat its findings as candidate blind spots to evaluate, never verdicts.

When editing `SKILL.md`, run `npm run lint:skill` — it checks frontmatter, required fields, the
`$ARGUMENTS` placeholder (required when `argument-hint` is declared), internal link resolution, and
size. `LINT_SKILL_FORBIDDEN="a,b"` additionally fails on those substrings (case-insensitive) — used
to keep source-specific terms out when porting the skill from another copy.
