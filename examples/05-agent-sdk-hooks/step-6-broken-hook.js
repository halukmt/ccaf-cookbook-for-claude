// Live: what does the SDK do with a PreToolUse hook that throws? This decides whether a bug in a
// policy lets the forbidden call through. The hook here is broken on purpose, with no try/catch.

import { check, finishChecks } from "../../_shared/check.js";
import { runBankAgent } from "./agent.js";
import { TOOL_PREFIX } from "./tools.js";

let hookCalls = 0;
const brokenPolicy = async () => {
  hookCalls++;
  throw new Error("simulated bug inside the policy");
};

const run = await runBankAgent(
  "Refund 750 to customer C-001 with process_refund. Call it once, then report exactly what the tool returned.",
  { hooksOverride: { PreToolUse: [{ matcher: `${TOOL_PREFIX}.*`, hooks: [brokenPolicy] }] } }
);

console.log("Ledger:", JSON.stringify(run.executed));
for (const result of run.toolResults) console.log(`${result.isError ? "ERROR " : ""}${result.toolName}: ${result.text}`);
console.log(`\nAnswer:\n${run.finalText}\n\nCost: $${run.costUsd.toFixed(4)}`);

const executed = run.executed.some((call) => call.name === "process_refund");
console.log(`\nObserved: a throwing PreToolUse hook ${executed ? "FAILED OPEN, the refund ran" : "failed closed, the refund did not run"}.`);

check("The broken hook really fired", hookCalls >= 1, `${hookCalls} calls`);
check("The model got a tool result", run.toolResults.length >= 1);
check(
  "Observed 2026-10-31: a throwing hook does not stop the tool, so a policy must catch its own errors",
  executed
);

finishChecks();
