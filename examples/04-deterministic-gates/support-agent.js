// A customer-support agent whose refund rule lives in code, not in the prompt.

import { findCustomers, findOrder } from "../../_fixtures/support.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";

export const TOOLS = [
  {
    name: "get_customer",
    description: "Find a customer by exact name or email and verify them. Returns customer_id and verified.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The customer's name or email address" } },
      required: ["query"],
    },
  },
  {
    name: "lookup_order",
    description: "Fetch an order by its ID, including the amount and owning customer_id.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
  {
    name: "process_refund",
    description: "Refund an amount to a customer.",
    input_schema: {
      type: "object",
      properties: { customer_id: { type: "string" }, amount: { type: "number" } },
      required: ["customer_id", "amount"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the case to a human agent, who cannot see this conversation. Use when an issue cannot " +
      "be resolved with the other tools. The fields must be complete and self-contained.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        conversation_summary: { type: "string", description: "Every concern the customer raised, with specifics" },
        root_cause_analysis: { type: "string" },
        refund_amount: { type: ["number", "null"], description: "Null when no refund applies" },
        recommended_action: { type: "string", description: "A next action for every concern" },
      },
      required: ["customer_id", "conversation_summary", "root_cause_analysis", "refund_amount", "recommended_action"],
    },
  },
];

const HANDOFF_TEXT_FIELDS = ["customer_id", "conversation_summary", "root_cause_analysis", "recommended_action"];
const PLACEHOLDER = /^(n\/?a|none|unknown|tbd|todo|-)?$/i;

export function handoffProblems(handoff) {
  const problems = HANDOFF_TEXT_FIELDS.filter(
    (field) => typeof handoff[field] !== "string" || PLACEHOLDER.test(handoff[field].trim())
  );
  if (handoff.refund_amount !== null && typeof handoff.refund_amount !== "number") {
    problems.push("refund_amount");
  }
  return problems;
}

// All state belongs to one session object, so verification cannot leak between conversations.
export function createSupportSession() {
  const state = { verifiedCustomerIds: new Set(), refunds: [], blocked: [], handoffs: [] };

  function handleToolCall(name, input) {
    if (name === "get_customer") {
      const matches = findCustomers(input.query);
      if (matches.length !== 1) {
        return JSON.stringify({ found: matches.length, verified: false });
      }
      const [customer] = matches;
      if (customer.verified) state.verifiedCustomerIds.add(customer.id);
      return JSON.stringify({ customer_id: customer.id, name: customer.name, verified: customer.verified });
    }

    if (name === "lookup_order") {
      const order = findOrder(input.order_id);
      return order ? JSON.stringify(order) : { content: `Order ${input.order_id} not found.`, isError: true };
    }

    if (name === "process_refund") {
      // The gate. Whatever the model decided, this refund does not run without verification.
      if (!state.verifiedCustomerIds.has(input.customer_id)) {
        state.blocked.push({ ...input });
        return {
          content:
            `BLOCKED: customer ${input.customer_id} has not been verified in this session. ` +
            "Call get_customer first.",
          isError: true,
        };
      }
      state.refunds.push({ ...input });
      return JSON.stringify({ status: "refunded", ...input });
    }

    if (name === "escalate_to_human") {
      const problems = handoffProblems(input);
      if (problems.length > 0) {
        return { content: `Handoff rejected. Complete these fields: ${problems.join(", ")}`, isError: true };
      }
      state.handoffs.push({ ...input });
      return JSON.stringify({ status: "handed_off", ticket: `HUM-${1000 + state.handoffs.length}` });
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  return { state, handleToolCall };
}

const SYSTEM =
  "You are a customer support agent. Use your tools to help the customer. You can look up customers " +
  "and orders and process refunds. You cannot change account data or settle billing disputes: " +
  "escalate those to a human. Handle every concern the customer raises.";

// `forceRefundFirst` makes the first model turn call process_refund, which simulates the rare case
// where the model skips verification on its own.
export async function runSupportAgent(prompt, { onEvent, forceRefundFirst = false } = {}) {
  const session = createSupportSession();
  const result = await runToolLoop({
    prompt,
    system: SYSTEM,
    tools: TOOLS,
    handleTool: session.handleToolCall,
    onEvent,
    ...(forceRefundFirst
      ? { model: FORCED_TOOL_MODEL, firstToolChoice: { type: "tool", name: "process_refund" } }
      : {}),
  });
  return { ...result, state: session.state };
}
