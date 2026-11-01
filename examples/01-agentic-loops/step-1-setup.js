// Step 1 — A client and two tool definitions, proved with one request.
//
// This script only proves the pieces exist and fit together. There is deliberately no loop
// here: the single API call below sends one request and stops. Step 2 turns it into a loop.

import { check, finishChecks } from "../../_shared/check.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { client, MODEL } from "./client.js";
import { toolDefinitions, toolImplementations } from "./tools.js";

console.log("=== 1. The two tool definitions Claude will receive ===\n");
console.log(JSON.stringify(toolDefinitions, null, 2));

console.log("\n=== 2. The local implementations, called directly (no model involved) ===\n");
const calculated = toolImplementations.calculator({ expression: "17 * 23" });
const searched = toolImplementations.web_search({ query: "population of Germany" });
const nothingFound = toolImplementations.web_search({ query: "weather on the moon" });
console.log("calculator:", calculated);
console.log("web_search:", searched);

console.log("\n=== 3. Registration check: one API call, no loop ===\n");

const response = await client.messages.create({
  model: MODEL,
  max_tokens: 1024,
  tools: toolDefinitions,
  messages: [{ role: "user", content: "What is 17 * 23?" }],
});

console.log("model:      ", response.model);
console.log("stop_reason:", response.stop_reason);

for (const block of response.content) {
  if (block.type === "tool_use") {
    console.log(`\nClaude asked us to run: ${block.name}`);
    console.log("with input:            ", block.input);
    console.log("tool_use id:           ", block.id);
  }
}
console.log(`\nComputed cost: ${usd(estimateCost(MODEL, response.usage))}\n`);

const toolCall = response.content.find((block) => block.type === "tool_use");

check(
  "Both tools have a name, a description and an object input_schema with required fields",
  toolDefinitions.length === 2 &&
    toolDefinitions.every(
      (t) => t.name && t.description && t.input_schema?.type === "object" && t.input_schema.required?.length > 0
    )
);
check("The calculator computes locally", calculated.result === 391, String(calculated.result));
let rejected = false;
try {
  toolImplementations.calculator({ expression: "process.exit(1)" });
} catch {
  rejected = true;
}
check("The calculator refuses anything but arithmetic", rejected);
check("The search stub returns the canned fact", searched.results.some((r) => r.snippet.includes("83,500,000")));
check("The search stub can return nothing", nothingFound.resultCount === 0);
check("The model stopped to ask for a tool", response.stop_reason === "tool_use", response.stop_reason);
check("It chose the calculator", toolCall?.name === "calculator", toolCall?.name);
check("Its expression evaluates to the right answer", toolImplementations.calculator(toolCall?.input ?? { expression: "0" }).result === 391);
finishChecks();
