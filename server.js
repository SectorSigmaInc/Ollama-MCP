#!/usr/bin/env node
// MCP server that exposes a local Ollama model as a technical advisor tool.
// One tool: `consult` -- sends a question (+ optional context) to Ollama's
// /api/chat with an advisor system prompt and returns the answer.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const OLLAMA = process.env.OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_ADVISOR_MODEL || "gemma4:26b";
const REQUEST_TIMEOUT_MS = 300_000; // cold model load can take ~60s; be generous.

// Optional default context window (num_ctx, in tokens). Unset/invalid => omit it so
// Ollama uses its own default. A larger window costs VRAM (KV cache scales with it).
const envNumCtx = Number.parseInt(process.env.OLLAMA_ADVISOR_NUM_CTX ?? "", 10);
const DEFAULT_NUM_CTX = Number.isInteger(envNumCtx) && envNumCtx > 0 ? envNumCtx : undefined;

const SYSTEM_PROMPT = `You are a senior technical advisor giving a second opinion to an engineering team that already has its own plan and context.
Be concise and direct. Challenge assumptions, name risks and tradeoffs, and call out what is missing or unstated.
Prefer specifics over generalities. Do not pad with pleasantries. End with a clear recommendation.
You advise; you do not decide.`;

const server = new McpServer({ name: "ollama-advisor", version: "1.0.0" });

server.registerTool(
  "consult",
  {
    title: "Consult Ollama advisor",
    description:
      "Ask the local Ollama model (gemma4) for a second opinion on a technical decision, design, or piece of code. " +
      "Returns the advisor's reasoning and recommendation. Use when you want an independent take, a sanity check, or to surface blind spots.",
    inputSchema: {
      question: z
        .string()
        .describe("The decision, design, or question to get advice on. Be specific."),
      context: z
        .string()
        .optional()
        .describe("Optional background: the current plan, relevant code, constraints, or prior reasoning."),
      model: z
        .string()
        .optional()
        .describe(`Ollama model tag to use. Defaults to ${DEFAULT_MODEL}.`),
      num_ctx: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          `Context window size in tokens to request from Ollama. Larger windows cost more VRAM and a new value forces a model reload, so vary it sparingly. Defaults to ${DEFAULT_NUM_CTX ?? "Ollama's own default"}.`
        ),
    },
  },
  async ({ question, context, model, num_ctx }) => {
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    if (context && context.trim()) {
      messages.push({ role: "user", content: `Context:\n${context.trim()}` });
    }
    messages.push({ role: "user", content: question });

    const payload = {
      model: model || DEFAULT_MODEL,
      messages,
      stream: false,
      keep_alive: "30m", // keep the model resident between consults
    };
    // Per-call arg wins, else the env default, else omit (Ollama picks its own default).
    const ctx = num_ctx ?? DEFAULT_NUM_CTX;
    if (ctx) payload.options = { num_ctx: ctx };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          isError: true,
          content: [{ type: "text", text: `Ollama returned HTTP ${res.status}: ${body}` }],
        };
      }

      const data = await res.json();
      const answer = (data?.message?.content || "").trim();
      return {
        content: [{ type: "text", text: answer || "(advisor returned an empty response)" }],
      };
    } catch (err) {
      const text =
        err?.name === "AbortError"
          ? `Ollama request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
          : `Failed to reach Ollama at ${OLLAMA}: ${err?.message || err}`;
      return { isError: true, content: [{ type: "text", text }] };
    } finally {
      clearTimeout(timer);
    }
  }
);

await server.connect(new StdioServerTransport());
