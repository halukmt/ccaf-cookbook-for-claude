// Live: does the model really receive normalised data? Checked at the API request, not in a log.

import { check, finishChecks } from "../../_shared/check.js";
import { runBankAgent } from "./agent.js";

const prompt =
  "Get customer C-001, then their order ORD-42, then shipment SHP-7. " +
  "For each one give its created_at and status.";

const run = await runBankAgent(prompt);
console.log("Available tools:", run.availableTools.join(", "));
for (const event of run.hookEvents) console.log(JSON.stringify(event));
console.log("\nSent to the model:");
for (const result of run.toolResults) console.log(`  ${result.toolName}: ${result.text}`);
console.log(`\nAnswer:\n${run.finalText}\n\nCost: $${run.costUsd.toFixed(4)}`);

const sent = run.toolResults.map((result) => JSON.parse(result.text));
const executed = run.executed.map((call) => call.name);

check("All three tools really ran", ["get_customer", "get_order", "get_shipment"].every((n) => executed.includes(n)), executed.join(", "));
check("The hook saw all three", run.policy.normalised.length >= 3);
check("Three results reached the model", sent.length >= 3);
check("Every date sent is ISO 8601 with milliseconds", sent.every((r) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(r.created_at)));
check("Every status sent is a word", sent.every((r) => typeof r.status === "string" && r.status.length > 1));

const wire = run.toolResults.map((r) => r.text).join(" ");
check("No raw epoch reached the model", !wire.includes("1710489600"));
check("No raw slash date reached the model", !wire.includes("15/03/2024"));
check("No raw status code reached the model", !/"status":\s*(200|"S")/.test(wire));
check("The answer reports the normalised shipment status", /shipped/i.test(run.finalText));
check("The answer reports the normalised customer date", run.finalText.includes("2024-03-15T08:00:00.000Z"));

finishChecks();
