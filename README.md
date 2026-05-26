# Ollama-MCP

An MCP (Model Context Protocol) server that exposes a local [Ollama](https://ollama.com)
model as a **technical advisor** tool inside Claude Code. It registers one tool,
`consult`, which sends a question (plus optional context) to your local model
with an advisor system prompt and returns the answer — a first-class second
opinion you can reach for mid-task.

**Why a *local* model?** Its value is not raw capability — a small local model sits well
below a frontier model — but **independence**: it has not seen your reasoning, so its
blind spots do not overlap with yours. Use it to pressure-test a decision, not to answer
it for you.

This repo ships two pieces that work together:

- **the MCP server** (`server.js`) — registers the `ollama` server exposing the `consult` tool; and
- **the `local-advisor` skill** (`skills/local-advisor/`) — a Claude Code skill that drives `consult` with an adversarial, sycophancy-resistant consultation discipline.

The server works on its own; the skill turns it into a disciplined second-opinion workflow.
Install the server first, then (optionally) the skill.

## Quick start (Windows / PowerShell)

```powershell
cd Ollama-MCP   # the directory you cloned into
./setup.ps1
```

> **macOS / Linux** (or to do it by hand on any OS): `setup.ps1` is PowerShell-only —
> use the cross-platform [**Manual install**](#manual-install) below instead.

`setup.ps1` is idempotent: it installs dependencies, ensures the default model
is pulled (loudly, since it's a multi-GB download), registers the server with
Claude Code at **user scope** — available in **every** Claude Code project on
this machine, no per-project step — and runs the smoke test. On a *fresh*
registration it reminds you to restart Claude Code so the `mcp__ollama__consult`
tool loads. The manual steps below are the by-hand fallback.

> If you downloaded the repo as a zip rather than `git clone`, PowerShell may
> block the script (Mark-of-the-Web). Run it with
> `powershell -ExecutionPolicy Bypass -File .\setup.ps1`.

## Requirements

- [Ollama](https://ollama.com) running locally (default `http://localhost:11434`)
  with at least one model pulled. Default model: `gemma4:26b`.
- Node.js 18+ (uses the global `fetch`; built and tested on Node 24).

## Manual install

Works on any OS (macOS, Linux, Windows). From the directory you cloned into:

```sh
npm install
```

## Register with Claude Code

User scope — registers once for **every** Claude Code session and project on
this machine (no per-project step):

```sh
claude mcp add ollama -s user -- node /absolute/path/to/Ollama-MCP/server.js
```

> Use the **absolute path** to `server.js` in your clone — e.g. `C:\dev\Ollama-MCP\server.js`
> on Windows, `/home/you/Ollama-MCP/server.js` on macOS/Linux. The server is registered at
> user scope, so the path must be absolute.

> To bake in a default context window, add `-e OLLAMA_ADVISOR_NUM_CTX=<tokens>` before the `--`.
> See [Configuration](#configuration-env-vars) for why that value is per-machine.

This writes to `~/.claude.json`. The tool is then exposed as
**`mcp__ollama__consult`**. Restart Claude Code so it loads the new server, then
confirm with `claude mcp get ollama` (expect `Scope: User config` and
`✓ Connected`).

To remove it: `claude mcp remove ollama -s user`.

## Install the `local-advisor` skill (optional)

The skill is a plain Markdown file. Copy it into your user skills directory so Claude Code
loads it in every project:

```sh
mkdir -p ~/.claude/skills/local-advisor
cp skills/local-advisor/SKILL.md ~/.claude/skills/local-advisor/SKILL.md
```

On Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force ~/.claude/skills/local-advisor | Out-Null
Copy-Item skills/local-advisor/SKILL.md ~/.claude/skills/local-advisor/SKILL.md
```

Restart Claude Code and invoke it with `/local-advisor`. (A one-command plugin install
may come in a future release.)

## Using the advisor — the consultation discipline

A weak model consulted naively just agrees with you. The skill enforces a discipline worth
applying even when you call `consult` by hand:

- **Adversarial by default.** When you already have a conclusion, give the advisor your
  conclusion and reasoning and tell it to *assume you are wrong and find the most likely
  failure point* — a failure-search, not a "review."
- **Open mode when you don't.** With no conclusion yet, pose the decision and constraints
  but withhold any answer you are leaning toward, so you don't anchor it.
- **Neutralize platform jargon.** The local model has never seen your stack; terms like
  *MCP*, *hook*, or *subagent* get silently reinterpreted. Spell them out in plain words
  before sending.
- **Adjudicate, don't defer.** It is a weaker model; treat its findings as candidate blind
  spots to evaluate, never as verdicts. The divergences from your thinking are the signal.

The full discipline lives in [`skills/local-advisor/SKILL.md`](skills/local-advisor/SKILL.md).

## The `consult` tool

| Input | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `question` | string | yes | — | The decision, design, or question to get advice on. |
| `context` | string | no | — | Background: the current plan, relevant code, constraints. |
| `model` | string | no | `gemma4:26b` | Ollama model tag to use. |
| `num_ctx` | integer | no | Ollama's default | Context window in tokens. Larger costs VRAM; a new value forces a model reload. |

Returns the model's text answer. On an HTTP error or an unreachable Ollama it
returns an `isError` result with a clear message instead of throwing.

> Note: gemma4 emits a separate `thinking` (chain-of-thought) field; the tool
> intentionally returns only `message.content` — the actual recommendation.

## Configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | Base URL of the Ollama server. |
| `OLLAMA_ADVISOR_MODEL` | `gemma4:26b` | Default model when the `model` arg is omitted. |
| `OLLAMA_ADVISOR_NUM_CTX` | _(unset)_ | Default context window (tokens) when the `num_ctx` arg is omitted. Unset lets Ollama choose. |

A sensible default context size depends on your GPU's VRAM, so it lives **per machine** in the
registration rather than in the code. `setup.ps1 -NumCtx <tokens>` bakes it in:

```powershell
./setup.ps1 -NumCtx 65536   # registers the server with OLLAMA_ADVISOR_NUM_CTX=65536
```

That is equivalent to `claude mcp add ollama -s user -e OLLAMA_ADVISOR_NUM_CTX=<tokens> -- node <path>`.
Re-running with `-NumCtx` re-registers (remove + add) to apply the value; omitting it leaves the
window unset (Ollama's default). Restart Claude Code afterward so the server picks up the change.

## Notes

- **First-call latency:** a cold model load can take ~60 s; the server sends
  `keep_alive: "30m"` to keep the model resident between calls. The request
  timeout is 300 s to absorb cold starts.
- **VRAM:** the default `gemma4:26b` (~17 GB of weights) loads on a 24 GB GPU
  leaving ~5 GB free for the context KV cache (measured at minimal context) —
  the roomier choice for long `context` inputs. `gemma4:31b` (~19 GB) trades
  that headroom for capability; pass `model: "gemma4:31b"` when you have room
  to spare.

## Test it standalone (any OS)

```sh
node test-client.mjs
```

Expect `TOOLS: consult`, `IS_ERROR: false`, and a one-sentence advisor answer. This — along
with `claude mcp get ollama` — is the OS-agnostic way to confirm the chain is live before
relying on it.

## Development

The skill is structurally linted by `scripts/lint-skill.mjs` — run it before committing a
change to the skill:

```sh
npm run lint:skill
```

It checks the `SKILL.md` frontmatter, required fields, the `$ARGUMENTS` placeholder, internal
link resolution, and file size. An optional `LINT_SKILL_FORBIDDEN="term1,term2"` environment
variable additionally fails the lint if any (case-insensitive) substring appears — useful when
porting a skill from another copy to keep source-specific terms out.

## License

MIT — see [LICENSE](LICENSE).
