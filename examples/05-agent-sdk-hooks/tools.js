// The tools the agent can call, as an in-process MCP server. Each handler records that it ran in
// `state.executed`. That ledger is how the examples prove a blocked tool really did not execute.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { rawAmlResult, rawCustomer, rawOrder, rawShipment } from "../../_fixtures/mixed-formats.js";

export const SERVER_NAME = "bank";
export const TOOL_PREFIX = `mcp__${SERVER_NAME}__`;

const asResult = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }] });

export function createBankTools(state) {
  const run = (name, input, data) => {
    state.executed.push({ name, input });
    return asResult(data);
  };

  return [
    tool("get_customer", "Look up a customer by ID.", { customer_id: z.string() }, async (input) =>
      run("get_customer", input, rawCustomer(input.customer_id))
    ),
    tool("get_order", "Look up an order by ID.", { order_id: z.string() }, async (input) =>
      run("get_order", input, rawOrder(input.order_id))
    ),
    tool("get_shipment", "Look up a shipment by ID.", { shipment_id: z.string() }, async (input) =>
      run("get_shipment", input, rawShipment(input.shipment_id))
    ),
    tool(
      "process_refund",
      "Refund an amount to a customer.",
      { customer_id: z.string(), amount: z.number() },
      async (input) => run("process_refund", input, { status: "refunded", ...input })
    ),
    tool(
      "aml_check",
      "Run the anti-money-laundering check for a customer. The status field is pass or fail.",
      { customer_id: z.string() },
      async (input) => run("aml_check", input, rawAmlResult(input.customer_id))
    ),
    tool(
      "transfer_funds",
      "Transfer funds internationally on behalf of a customer.",
      { customer_id: z.string(), to: z.string(), amount: z.number() },
      async (input) => run("transfer_funds", input, { status: "transferred", ...input })
    ),
  ];
}

export function createBankServer(tools) {
  return createSdkMcpServer({ name: SERVER_NAME, version: "1.0.0", tools });
}
