// Starts the customer database as a real stdio MCP child process and connects a client to it.

import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("./customer-db-server.js", import.meta.url));

export async function connectCustomerDb() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER] });
  const client = new Client({ name: "recovery-agent", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
