// A small stdio MCP server that proves how it was configured. It stands in for a community server
// that would need a real token. On every start it records what it really received: the label,
// and a hash of the token, never the token. It also records whether it can see the API key, as a yes or no.

import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const token = process.env.CCAF_DEMO_TOKEN ?? null;
const label = process.env.SERVER_LABEL ?? "unlabelled";
const status = {
  label,
  tokenPresent: token !== null,
  tokenSha256: token === null ? null : createHash("sha256").update(token).digest("hex"),
  tokenIsUnexpandedLiteral: token?.includes("${") ?? false,
  apiKeyVisibleToServer: Boolean(process.env.ANTHROPIC_API_KEY),
};

if (process.env.PROOF_FILE) appendFileSync(process.env.PROOF_FILE, `${JSON.stringify(status)}\n`);

const server = new McpServer({ name: "scope-server", version: "1.0.0" });
server.registerTool(
  "server_status",
  { description: "Reports this server's configuration label and a hash of the token it received. Takes no input." },
  async () => ({ content: [{ type: "text", text: JSON.stringify(status) }] })
);
await server.connect(new StdioServerTransport());
