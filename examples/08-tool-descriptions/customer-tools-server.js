// A real MCP server with two tools, built twice: with vague descriptions and with production ones.
// Only the description strings differ, so any change in routing comes from the descriptions alone.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const VAGUE = {
  get_customer: { tool: "Retrieves customer information" },
  lookup_order: { tool: "Retrieves order details" },
};

export const RICH = {
  get_customer: {
    tool:
      "Looks up one customer account by email address (user@domain.com), phone number (555-0123) or " +
      "customer ID (C-1001). Returns the profile: name, contact details, account status and loyalty tier. " +
      "Use it for questions about who someone is or the state of their account, such as 'find the account " +
      "for john@example.com' or 'what loyalty tier is this customer?'. If no identifier was given, pass " +
      "the word 'current' to mean the customer in this conversation. Do NOT use it for questions about an " +
      "order, a package, delivery or a refund: use lookup_order for those, even when an email appears too.",
    identifier: "Customer email, phone number or customer ID, or 'current'",
  },
  lookup_order: {
    tool:
      "Looks up one order by order number (#12345). Returns status, items, tracking, delivery date and " +
      "refund eligibility. Use it for anything about a purchase after it was placed, such as 'where is " +
      "my package?', 'when will order #99999 arrive?' or 'can order #67890 be refunded?'. If no order " +
      "number was given, pass the word 'latest' to mean this customer's most recent order. Do NOT use it " +
      "for account or identity questions, such as tier or account status: use get_customer for those.",
    identifier: "Order number such as #12345, or 'latest'",
  },
};

export function createCustomerServer(descriptions) {
  const server = new McpServer({ name: "routing-demo", version: "1.0.0" });
  for (const [name, text] of Object.entries(descriptions)) {
    const identifier = text.identifier ? z.string().describe(text.identifier) : z.string();
    server.registerTool(
      name,
      { description: text.tool, inputSchema: { identifier } },
      async ({ identifier: value }) => ({ content: [{ type: "text", text: `${name} result for ${value}` }] })
    );
  }
  return server;
}

// Asks the running server for its tools over MCP and returns them in the Messages API's shape, so
// the model sees what the server really published and not a copy kept in this file.
export async function publishedTools(descriptions) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createCustomerServer(descriptions);
  const client = new Client({ name: "routing-harness", version: "1.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  const echo = await client.callTool({ name: tools[0].name, arguments: { identifier: "probe" } });
  await client.close();
  return {
    echo: echo.content[0].text,
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
  };
}
