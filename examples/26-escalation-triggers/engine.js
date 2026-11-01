// The escalation decision engine. The prompt holds the judgement calls. Code holds the two rules that must
// always hold: an explicit human request skips the model, and an ambiguous match exposes no record.

import { CUSTOMERS, findCustomers, findOrder, ORDERS } from "../../_fixtures/support.js";
import { runToolLoop } from "../../_shared/loop.js";

export const CRITERIA =
  "## When to escalate\n\n" +
  "1. EXPLICIT HUMAN REQUEST\n   Description: the customer says they want a person, a manager or a human.\n" +
  "   Action: call escalate_to_human immediately, as your first action. Do not investigate, look anything up or offer to help first.\n" +
  "2. POLICY GAP\n   Description: the request falls outside documented policy, where the policy is silent. A violation is different: when the policy says no, " +
  "the answer is documented, so give it and do not escalate.\n   Action: call escalate_to_human so that a person can decide.\n" +
  "3. INABILITY TO PROGRESS\n   Description: you tried and cannot advance, because of tool errors, missing system access or a need for engineering work.\n" +
  "   Action: call escalate_to_human, with what you tried.\n\n" +
  "DO NOT escalate based on: how frustrated the customer is, your own confidence, or sentiment.";

export const EXAMPLES =
  "\n\n## Examples\n\n" +
  'Customer: "Put me through to an actual person immediately."\n' +
  "Reasoning: an explicit request for a human. It does not matter whether the issue looks simple.\n" +
  "Action: ESCALATE IMMEDIATELY, with no lookup and no offer to help first.\n\n" +
  'Customer: "Honestly, this is absurd! My parcel is seven days overdue and no one there cares!"\n' +
  "Reasoning: strong frustration, but no request for a person, and late delivery is covered by policy. Frustration alone is never a trigger.\n" +
  "Action: RESOLVE. Acknowledge the frustration, then offer the reshipment.\n" +
  'Response: "I can see why that is frustrating. I will find your order and send a replacement straight away."\n\n' +
  'Customer: "This came from another retailer, but I would like to bring it back to your shop. Your published terms do not cover that."\n' +
  "Reasoning: calm, but policy is silent on competitor purchases. It is a gap and not a violation, so nothing documented answers it.\n" +
  "Action: ESCALATE as a policy gap, without deciding it yourself.";

export const POLICY =
  "## Documented policy\n" +
  "- Items that arrive damaged or defective: issue a free replacement with issue_replacement.\n" +
  "- Late deliveries: issue a free replacement with issue_replacement.\n" +
  "- Change-of-mind returns: accepted within 30 days of the order date. After 30 days the answer is no.\n" +
  "- Nothing else is documented. Today's date is 2026-10-31.";

export const IDENTITY =
  "## Identifying customers\n" +
  "Use get_customer before any order action. If it reports several accounts, ask for an email, phone number, order number or postcode. " +
  "Never choose an account by city, recent activity, tier or any other guess.";

export const SYSTEM = `You are a customer support agent. Use your tools. Keep replies short.\n\n${POLICY}\n\n${IDENTITY}\n\n${CRITERIA}${EXAMPLES}`;

const LAST_ACTIVE = { "C-1003": "2026-10-11", "C-1004": "2025-01-02" };
const city = (customer) => customer.address.split(",").at(-1).trim();

// "matched" is the only result that ever carries a record.
export function handleCustomerLookup(matches) {
  if (matches.length === 0) return { action: "not_found", message: "No customer record fits that search." };
  if (matches.length === 1) return { action: "matched", customer: matches[0] };
  return {
    action: "disambiguate",
    message: "More than one account has that name. To pick out the right one, please give me one of these:\n" +
      "- Email\n- Phone\n- Order number\n- Postcode",
    matchCount: matches.length,
  };
}

// A name, narrowed by real identifiers. There is no parameter for a city or a guess, so none can be used.
export function searchCustomers({ name, email, phone, order_id }) {
  let matches = name ? findCustomers(name) : CUSTOMERS;
  if (email) matches = matches.filter((c) => c.email.toLowerCase() === email.trim().toLowerCase());
  if (phone) matches = matches.filter((c) => c.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
  if (order_id) {
    const owner = ORDERS.find((order) => order.id === order_id)?.customer_id;
    matches = matches.filter((c) => c.id === owner);
  }
  if (!name && !email && !phone && !order_id) return [];
  return matches;
}

// Deliberately simple, tuned to fire on a request for a person and to stay quiet on mere mentions of one.
const WANT_PERSON = /\b(speak|talk|transfer|connect|put|get|give|let)\b[^.?!]{0,30}\b(human|person|manager|supervisor|representative|agent|someone real)\b/i;
const NEED_PERSON = /\b(want|need)\b\s+(a|an|to\s+\w+\s+(to\s+)?(a|an))?\s*(real\s+)?(human|person|manager|supervisor|representative|agent)\b/i;
export const detectExplicitHumanRequest = (message) => WANT_PERSON.test(message) || NEED_PERSON.test(message);

export const TOOLS = [
  {
    name: "get_customer",
    description: "Find a customer account by name, optionally narrowed by email, phone or order number.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, order_id: { type: "string" } },
    },
  },
  {
    name: "lookup_order",
    description: "Read an order. Only works for the identified customer.",
    input_schema: { type: "object", properties: { customer_id: { type: "string" }, order_id: { type: "string" } }, required: ["customer_id", "order_id"] },
  },
  {
    name: "issue_replacement",
    description: "Send a free replacement for a damaged, defective or late order. Only works for the identified customer.",
    input_schema: { type: "object", properties: { customer_id: { type: "string" }, order_id: { type: "string" } }, required: ["customer_id", "order_id"] },
  },
  {
    name: "escalate_to_human",
    description: "Hand over to a human agent. State which trigger applies.",
    input_schema: {
      type: "object",
      properties: {
        trigger: { type: "string", enum: ["explicit_human_request", "policy_gap", "inability_to_progress"] },
        summary: { type: "string", description: "What the customer needs and what was tried" },
      },
      required: ["trigger", "summary"],
    },
  },
];

// `exposeRecords` is the prompt-only test: the tool hands over every match, as a naive one would, and only the
// prompt says not to choose. `failOrderLookups` simulates a systems outage for the third trigger.
export function createSession({ exposeRecords = false, failOrderLookups = false } = {}) {
  const state = { resolved: new Set(), blocked: [], replacements: [], escalations: [], lastLookup: null };

  const owned = ({ customer_id, order_id }) => {
    if (!state.resolved.has(customer_id)) {
      state.blocked.push({ customer_id, order_id, why: "not_identified" });
      return { content: `BLOCKED: ${customer_id} was not uniquely identified. Ask the customer for an identifier.`, isError: true };
    }
    const order = findOrder(order_id);
    if (!order || order.customer_id !== customer_id) {
      state.blocked.push({ customer_id, order_id, why: "not_owner" });
      return { content: `Order ${order_id} was not found for this customer.`, isError: true };
    }
    return order;
  };

  function handleToolCall(name, input) {
    if (name === "get_customer") {
      const outcome = handleCustomerLookup(searchCustomers(input));
      state.lastLookup = outcome.action;
      if (outcome.action === "matched") {
        state.resolved.add(outcome.customer.id);
        return JSON.stringify({ action: "matched", customer_id: outcome.customer.id, name: outcome.customer.name });
      }
      if (outcome.action === "disambiguate" && exposeRecords) {
        // Every match becomes usable here, which is exactly what a safe tool must not do.
        const records = searchCustomers(input);
        for (const record of records) state.resolved.add(record.id);
        return JSON.stringify({ ...outcome, records: records.map((c) => ({ customer_id: c.id, name: c.name, city: city(c), lastActive: LAST_ACTIVE[c.id] })) });
      }
      return JSON.stringify(outcome);
    }
    if (name === "lookup_order") {
      if (failOrderLookups) return { content: "Order system unavailable: connection refused. Retries failed.", isError: true };
      const order = owned(input);
      return order.isError ? order : JSON.stringify(order);
    }
    if (name === "issue_replacement") {
      const order = owned(input);
      if (order.isError) return order;
      state.replacements.push({ ...input });
      return JSON.stringify({ status: "replacement_sent", order_id: input.order_id });
    }
    if (name === "escalate_to_human") {
      state.escalations.push({ ...input });
      return JSON.stringify({ status: "handed_off", ticket: `HUM-${2000 + state.escalations.length}` });
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  return { state, handleToolCall };
}

function classify(state, toolCalls) {
  const firstEscalation = toolCalls.findIndex((call) => call.name === "escalate_to_human");
  if (firstEscalation === 0) return "escalate_immediate";
  if (firstEscalation > 0) return "escalate";
  if (state.replacements.length) return "resolved";
  if (state.lastLookup === "disambiguate") return "disambiguate";
  return "replied";
}

// `codeGate` true: a detected human request goes straight to a person, and the model is never called.
export async function processScenario(input, { codeGate = false, onEvent, ...sessionOptions } = {}) {
  if (codeGate && detectExplicitHumanRequest(input)) {
    const session = createSession();
    session.handleToolCall("escalate_to_human", { trigger: "explicit_human_request", summary: input });
    return {
      input, decidedBy: "code", action: "escalate_immediate", investigationSteps: 0, tools: ["escalate_to_human"], trigger: "explicit_human_request",
      text: "I'm connecting you to a person now.", usage: { input_tokens: 0, output_tokens: 0 }, blocked: [],
    };
  }
  const session = createSession(sessionOptions);
  const result = await runToolLoop({ prompt: input, system: SYSTEM, tools: TOOLS, handleTool: session.handleToolCall, maxTokens: 1500, onEvent });
  if (result.stopReason !== "end_turn") throw new Error(`Scenario ended with ${result.stopReason}: ${input}`);
  const tools = result.toolCalls.map((call) => call.name);
  const firstEscalation = tools.indexOf("escalate_to_human");
  return {
    input, decidedBy: "model", action: classify(session.state, result.toolCalls),
    investigationSteps: firstEscalation === -1 ? tools.length : firstEscalation,
    tools, toolInputs: result.toolCalls.map((call) => ({ name: call.name, input: call.input })),
    trigger: session.state.escalations[0]?.trigger ?? null, text: result.finalText, usage: result.usage, blocked: session.state.blocked,
  };
}
