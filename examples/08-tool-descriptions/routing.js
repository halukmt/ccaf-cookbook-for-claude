// Sends each query once with tool_choice auto and records which tool the model picked.
// Tools are never executed: the first choice is the thing being measured.

import { client, MODEL } from "../../_shared/client.js";

export const CASES = [
  ["What is the status of order #12345?", "lookup_order"],
  ["Look up customer john@example.com", "get_customer"],
  ["Check my order tracking", "lookup_order"],
  ["Find the account for phone 555-0123", "get_customer"],
  ["Where is my package?", "lookup_order"],
  ["Is order #67890 eligible for a refund?", "lookup_order"],
  ["What loyalty tier is this customer?", "get_customer"],
  ["I need details on order #11111", "lookup_order"],
  ["Verify the customer account status", "get_customer"],
  ["When will order #99999 arrive?", "lookup_order"],
].map(([query, expected]) => ({ query, expected }));

// Added to the plain list above. Each names a person but asks about a purchase, or the reverse, so the
// identifier points at one tool and the intent at the other. Without these, the vague run had no
// wrong-tool result at all, and step 4 would have nothing to say about misrouting.
export const HARD_CASES = [
  ["john@example.com has not received what he bought last week", "lookup_order"],
  ["Has customer 555-0123 got a refund yet?", "lookup_order"],
  ["Can anna@example.com still return the lamp?", "lookup_order"],
  ["Does anna@example.com still have gold status after order #12345?", "get_customer"],
].map(([query, expected]) => ({ query, expected }));

// "no call" is kept apart from "wrong tool". Asking for a missing ID is not the same mistake as
// querying the wrong system, although a plain accuracy score counts both as a miss.
export async function measureRouting({ tools, system, cases = CASES, model = MODEL, onResult = () => {} }) {
  const rows = [];
  for (const { query, expected } of cases) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      tools,
      tool_choice: { type: "auto" },
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: query }],
    });
    const calls = response.content.filter((block) => block.type === "tool_use");
    const tool = calls[0]?.name ?? null;
    const row = {
      query,
      expected,
      tool,
      outcome: tool === null ? "no call" : tool === expected ? "correct" : "wrong tool",
      identifier: calls[0]?.input?.identifier ?? null,
      allTools: calls.map((call) => call.name),
      stopReason: response.stop_reason,
      text: response.content.filter((block) => block.type === "text").map((block) => block.text).join(" ").slice(0, 160),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    rows.push(row);
    onResult(row);
  }
  return { model, system: system ?? null, rows, ...score(rows) };
}

export function score(rows) {
  const count = (outcome) => rows.filter((row) => row.outcome === outcome).length;
  return {
    correct: count("correct"),
    wrongTool: count("wrong tool"),
    noCall: count("no call"),
    total: rows.length,
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
  };
}

export const formatRow = (row) =>
  `${row.outcome.toUpperCase().padEnd(10)} | ${row.query} => ${row.tool ?? "(none)"} (expected: ${row.expected})`;

// Assumed price of 3 and 15 USD per million tokens, for a rough cost line only. Not read from the API.
export const roughCost = ({ inputTokens, outputTokens }) => (inputTokens * 3 + outputTokens * 15) / 1e6;
