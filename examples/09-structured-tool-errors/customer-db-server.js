// A stdio MCP server with one tool over the shared mock customers. `mode` triggers each failure on demand.
// Run as a child process by mcp-connection.js.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CUSTOMERS } from "../../_fixtures/support.js";

const VALID_IDENTIFIER = /^([^@\s]+@[^@\s]+\.[^@\s]+|C-\d{4})$/;

// Every failure leaves through here, so no error can be missing a field.
export function buildErrorResponse(errorCategory, isRetryable, description) {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ errorCategory, isRetryable, description }) }],
  };
}

function emptyResult(identifier) {
  return {
    isError: false,
    content: [{
      type: "text",
      text: JSON.stringify({
        resultCount: 0,
        message: `No customer matches ${identifier}. The query executed successfully and returned zero results.`,
      }),
    }],
  };
}

const invalid = (identifier) =>
  buildErrorResponse("validation", true, `Invalid identifier format: ${identifier}. Expected an email (user@domain.com) or a customer ID (C-NNNN). Correct the input before calling again; the same value will fail again.`);

function lookup(identifier, mode) {
  switch (mode) {
    case "timeout":
      return buildErrorResponse("transient", true, "The customer database timed out at 5 seconds, so the query did not execute. Nothing is wrong with the request, and a retry should succeed.");
    case "invalid":
      return invalid(identifier);
    case "business":
      return buildErrorResponse("business", false, "This 750 refund is above the limit of 500 for automatic approval. Retrying will not help. Escalate to a manager with the refund details.");
    case "permission":
      return buildErrorResponse("permission", false, "This service account has no access to financial records. Retrying will not help. Request elevated credentials or a senior agent.");
    case "not_found":
      return emptyResult(identifier);
    case "crash":
      // Stands for a bug: an exception that nobody turned into structured metadata.
      throw new Error("Unexpected database driver failure");
    default:
      break;
  }
  // The real path, used in success mode. The format check here is real too.
  if (!VALID_IDENTIFIER.test(identifier)) return invalid(identifier);
  const needle = identifier.toLowerCase();
  const matches = CUSTOMERS.filter((c) => c.id.toLowerCase() === needle || c.email.toLowerCase() === needle);
  if (matches.length === 0) return emptyResult(identifier);
  const { id, name, email, tier } = matches[0];
  return {
    isError: false,
    content: [{ type: "text", text: JSON.stringify({ resultCount: 1, customer: { id, name, email, tier } }) }],
  };
}

const server = new McpServer({ name: "mock-customers", version: "1.0.0" });
server.registerTool(
  "customer_lookup",
  {
    description: "Finds one customer by email address or customer ID. The mode parameter can simulate a failure.",
    inputSchema: {
      identifier: z.string().describe("Email address or customer ID"),
      mode: z.enum(["success", "not_found", "timeout", "invalid", "business", "permission", "crash"]).default("success"),
    },
  },
  async ({ identifier, mode }) => lookup(identifier, mode)
);

await server.connect(new StdioServerTransport());
