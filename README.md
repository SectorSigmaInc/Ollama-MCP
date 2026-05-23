# Ollama-MCP

An MCP (Model Context Protocol) server that exposes a local [Ollama](https://ollama.com)
model as a **technical advisor** tool inside Claude Code. It registers one tool,
`consult`, which sends a question (plus optional context) to your local model
with an advisor system prompt and returns the answer — a first-class second
opinion you can reach for mid-task.

## Quick start

```powershell
cd C:\dev\Ollama-MCP
./setup.ps1
```

`setup.ps1` is idempotent: it installs dependencies, ensures the default model
is pulled (loudly, since it's a multi-GB download), registers the server with
Claude Code at **user scope** — available in **every** Claude Code project on
this machine, no per-project step — and runs the smoke test. On a *fresh*
registration it reminds you to restart Claude Code so the `mcp__ollama__consult`
tool loads. The manual steps below are the by-hand fallback.

## Requirements

- [Ollama](https://ollama.com) running locally (default `http://localhost:11434`)
  with at least one model pulled. Default model: `gemma4:31b`.
- Node.js 18+ (uses the global `fetch`; built and tested on Node 24).

## Install

```powershell
cd C:\dev\Ollama-MCP
npm install
```

## Register with Claude Code

User scope — registers once for **every** Claude Code session and project on
this machine (no per-project step):

```powershell
claude mcp add ollama -s user -- node C:\dev\Ollama-MCP\server.js
```

This writes to `~/.claude.json`. The tool is then exposed as
**`mcp__ollama__consult`**. Restart Claude Code so it loads the new server, then
confirm with `claude mcp get ollama` (expect `Scope: User config` and
`✓ Connected`).

To remove it: `claude mcp remove ollama -s user`.

## The `consult` tool

| Input | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `question` | string | yes | — | The decision, design, or question to get advice on. |
| `context` | string | no | — | Background: the current plan, relevant code, constraints. |
| `model` | string | no | `gemma4:31b` | Ollama model tag to use. |

Returns the model's text answer. On an HTTP error or an unreachable Ollama it
returns an `isError` result with a clear message instead of throwing.

> Note: gemma4 emits a separate `thinking` (chain-of-thought) field; the tool
> intentionally returns only `message.content` — the actual recommendation.

## Configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | Base URL of the Ollama server. |
| `OLLAMA_ADVISOR_MODEL` | `gemma4:31b` | Default model when the `model` arg is omitted. |

## Notes

- **First-call latency:** a cold model load can take ~60 s; the server sends
  `keep_alive: "30m"` to keep the model resident between calls. The request
  timeout is 300 s to absorb cold starts.
- **VRAM:** `gemma4:31b` (~19 GB) fits on a 24 GB GPU with ~5 GB left for
  context. For very long `context` inputs, pass `model: "gemma4:26b"` (~17 GB)
  for more headroom.

## Test it standalone

```powershell
node test-client.mjs
```

Expect `TOOLS: consult`, `IS_ERROR: false`, and a one-sentence advisor answer.
