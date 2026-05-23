// End-to-end smoke test: spawn the server over stdio, list tools, call `consult`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const transport = new StdioClientTransport({
  command: "node",
  args: [join(here, "server.js")],
});

const client = new Client({ name: "advisor-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const result = await client.callTool(
  {
    name: "consult",
    arguments: {
      question: "In one short sentence: name the single biggest risk of using a local LLM as a coding advisor.",
    },
  },
  undefined,
  { timeout: 300_000 } // override the SDK's 60s default to absorb cold model loads
);

console.log("IS_ERROR:", result.isError === true);
console.log("ANSWER:", result.content?.map((c) => c.text).join("\n"));

await client.close();
process.exit(0);
