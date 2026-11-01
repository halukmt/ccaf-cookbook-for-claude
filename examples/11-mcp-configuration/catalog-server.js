// A stdio MCP server over a mock schema. The exploratory tools always exist. With WITH_RESOURCE=1,
// the whole catalogue is also published as a read-only resource. With RESOURCE_HINT=1, the tool
// description also points to that resource.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SHOP_SCHEMA } from "../../_fixtures/shop-schema.js";

export const SCHEMA_URI = "db://schema/main";

const server = new McpServer({ name: "shop-catalog", version: "1.0.0" });

server.registerTool(
  "list_tables",
  {
    description:
      "Lists the table names of the shop database." +
      (process.env.RESOURCE_HINT === "1"
        ? ` The full catalogue with every column is available in one read as the MCP resource ${SCHEMA_URI} on this server. Read that instead of describing tables one by one.`
        : ""),
  },
  async () => ({ content: [{ type: "text", text: JSON.stringify(SHOP_SCHEMA.tables.map((t) => t.name)) }] })
);

server.registerTool(
  "describe_table",
  { description: "Returns the columns and types of one table.", inputSchema: { table: z.string() } },
  async ({ table }) => {
    const found = SHOP_SCHEMA.tables.find((t) => t.name === table);
    if (!found) return { isError: true, content: [{ type: "text", text: `No table named ${table}.` }] };
    return { content: [{ type: "text", text: JSON.stringify(found) }] };
  }
);

if (process.env.WITH_RESOURCE === "1") {
  server.registerResource(
    "db-schema",
    SCHEMA_URI,
    { description: "Every table in the database, with its columns and types", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(SHOP_SCHEMA) }] })
  );
}

await server.connect(new StdioServerTransport());
