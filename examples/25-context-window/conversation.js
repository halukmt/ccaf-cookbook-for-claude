// A real ten-turn support conversation, with real summaries written by the model. Summaries are not hand-written,
// because a hand-written lossy summary would only prove what its author left out.

import { client, MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";
import { addUsage } from "../../_shared/pricing.js";
import { buildPrompt, extractCaseFacts, mergeCaseFacts, RETURN_FIELDS, trimToolResult } from "./case-facts.js";
import { lookupOrder, RAW_RETURN } from "./order-data.js";

export const SYSTEM =
  "You are a customer support agent for a kitchen appliance shop. Use your tools for order data. Keep replies short. " +
  "Shop facts: the loyalty programme gives 1 point per dollar and 100 points are worth $1. Stores open 10:00 to 16:00 at weekends. " +
  "Warranties stay with the product when it is gifted. We ship to the UK and Ireland. " +
  "Only state case details you actually have. If you no longer have a detail, say so.";

export const TOOLS = [
  {
    name: "lookup_order",
    description: "Look up one order by its order number.",
    input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
  },
  {
    name: "create_return",
    description: "Start a return for an order, once the customer has asked for it. Returns the RMA reference and refund figures.",
    input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
  },
];

export const CUSTOMER_TURNS = [
  "Hi, my blender from order #8891 stopped working after two uses. Can you look into it?",
  "Okay. I also bought a replacement jug on order #8917 and that cracked. Can you check that one too?",
  "Please start the return on #8891 only. I'll keep the jug for now and think about it.",
  "Send the refund to my Visa ending 4417, not to the store card.",
  "Unrelated: how does your loyalty programme work?",
  "What are your weekend opening hours?",
  "If I give the replacement blender away as a gift, does the warranty go with it?",
  "My neighbour has the same blender and it failed too. Should she contact you?",
  "Do you ship to Ireland?",
  "Before I go, please confirm everything you have on my case: my customer ID, both order numbers with their dates, totals and status, " +
    "the return reference, the restocking fee, the net refund, the refund date, and the card it goes to.",
];

// Compared against the final answers. `from` says where the value entered the conversation.
export const KNOWN_FACTS = [
  { name: "customer ID", pattern: /C-4471/, from: "raw lookup only, the trim list removes it", inBlock: true },
  { name: "order number #8891", pattern: /8891/, from: "lookup", inBlock: true },
  { name: "order date 2024-03-03", pattern: /2024-03-03|March 3\b|3(rd)? March|Mar 3\b/, from: "lookup", inBlock: true },
  { name: "total $247.83", pattern: /247\.83/, from: "lookup", inBlock: true },
  { name: "status delivered", pattern: /\bdelivered\b/i, from: "raw lookup only, the trim list removes it", inBlock: true },
  { name: "order number #8917", pattern: /8917/, from: "lookup", inBlock: true },
  { name: "order date 2024-03-19", pattern: /2024-03-19|March 19\b|19(th)? March|Mar 19\b/, from: "lookup", inBlock: true },
  { name: "total $64.19", pattern: /64\.19/, from: "lookup", inBlock: true },
  { name: "return RMA-55210", pattern: /RMA-55210/, from: "return", inBlock: true },
  { name: "restocking fee $12.50", pattern: /restocking[^\n.]{0,40}12\.50?\b|12\.50?\b[^\n.]{0,20}restocking/i, from: "return", inBlock: true },
  { name: "net refund $235.33", pattern: /235\.33/, from: "return", inBlock: true },
  { name: "refund date 2024-03-29", pattern: /2024-03-29|March 29\b|29(th)? March|Mar 29\b/, from: "return", inBlock: true },
  { name: "Visa ending 4417", pattern: /4417/, from: "customer said it, never in a tool result", inBlock: false },
];

export function scoreFacts(text) {
  const survived = KNOWN_FACTS.filter((fact) => fact.pattern.test(text)).map((fact) => fact.name);
  const lost = KNOWN_FACTS.filter((fact) => !fact.pattern.test(text)).map((fact) => fact.name);
  // An exact-looking amount that is not a known figure would be worse than a lost one.
  const knownAmounts = new Set(["247.83", "64.19", "12.50", "12.5", "235.33", "1", "1.00"]);
  const inventedAmounts = [...text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map((m) => m[1]).filter((value) => !knownAmounts.has(value));
  return { survived, lost, inventedAmounts };
}

export const SUMMARY_STYLES = {
  concise: "Summarise this customer support conversation for the agent who will continue it. Be concise.",
  tight: "Summarise this customer support conversation for the agent who will continue it, in at most 40 words.",
};

function transcriptOf(messages) {
  const lines = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      lines.push(`${message.role}: ${message.content}`);
      continue;
    }
    for (const block of message.content) {
      if (block.type === "text") lines.push(`${message.role}: ${block.text}`);
      if (block.type === "tool_use") lines.push(`tool call: ${block.name} ${JSON.stringify(block.input)}`);
      if (block.type === "tool_result") lines.push(`tool result: ${block.content}`);
    }
  }
  return lines.join("\n");
}

export function newConversation() {
  return { facts: null, summary: null, recent: [], summaries: [], turnsLog: [], usage: {}, relookups: 0 };
}

function toolHandler(state) {
  return (name, input) => {
    if (name === "lookup_order") {
      const raw = lookupOrder(input.order_id);
      if (!raw) return { content: `Order ${input.order_id} not found.`, isError: true };
      state.facts = mergeCaseFacts(state.facts, extractCaseFacts(raw)); // Extraction runs on the raw result.
      return JSON.stringify(trimToolResult(raw));
    }
    if (name === "create_return") {
      state.facts = mergeCaseFacts(state.facts, extractCaseFacts(RAW_RETURN));
      return JSON.stringify(trimToolResult(RAW_RETURN, RETURN_FIELDS));
    }
    throw new Error(`Unknown tool: ${name}`);
  };
}

// One customer turn. Turns since the last summary are kept in `recent`; the summary and block are rebuilt each call.
export async function runTurn(state, text, { useBlock = false } = {}) {
  const useSummary = state.summary !== null;
  const messages = useSummary
    ? buildPrompt(useBlock ? state.facts : null, state.summary, text, state.recent)
    : [...state.recent, { role: "user", content: text }];
  const header = useSummary ? 2 : 0;
  const result = await runToolLoop({ messages, system: SYSTEM, tools: TOOLS, handleTool: toolHandler(state), maxTokens: 1500 });
  if (result.stopReason !== "end_turn") throw new Error(`Turn ended with ${result.stopReason}`);
  addUsage(state.usage, result.usage);
  state.recent = result.messages.slice(header);
  if (useSummary) state.relookups += result.toolCalls.filter((call) => call.name === "lookup_order").length;
  state.turnsLog.push({
    customer: text, answer: result.finalText, tools: result.toolCalls.map((call) => call.name),
    inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens, iterations: result.iterations,
  });
  return result;
}

export async function summarise(state, style) {
  const prior = state.summary ? `Earlier summary:\n${state.summary}\n\nConversation since then:\n` : "";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: `${SUMMARY_STYLES[style]}\n\n${prior}${transcriptOf(state.recent)}` }],
  });
  addUsage(state.usage, response.usage);
  const summary = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  if (!summary) throw new Error(`Empty summary: stop_reason ${response.stop_reason}, blocks ${response.content.map((b) => b.type).join(",") || "none"}`);
  state.summary = summary;
  state.recent = [];
  state.summaries.push({ afterTurn: state.turnsLog.length, style, text: summary, ...scoreFacts(summary) });
}
