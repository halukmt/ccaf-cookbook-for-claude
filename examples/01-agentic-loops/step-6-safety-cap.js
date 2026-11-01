// Step 6 — The safety iteration cap.
//
// Two runs of the SAME task, to show both halves of what the cap is for:
//
//   Case A  cap = 20 (the real value) — stop_reason ends the run long before the cap.
//   Case B  cap = 1  (artificially low) — the guard rail fires and warns.
//
// Case B is the interesting one: the run aborts with no answer. That is the correct behaviour.
// A cap that silently returned a partial result would hide the failure instead of surfacing it.

import { check, finishChecks } from "../../_shared/check.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { runAgent, MAX_ITERATIONS } from "./agent-loop.js";
import { MODEL } from "./client.js";

const TASK = "Look up the population of Germany, then calculate how many people 12% of that is.";

async function run(options) {
  const events = [];
  const answer = await runAgent(TASK, { ...options, onEvent: (event) => events.push(event) });
  return { answer, events, done: events.find((e) => e.type === "done"), cap: events.find((e) => e.type === "cap") };
}

console.log(`\n\n########## CASE A — normal run, cap = ${MAX_ITERATIONS} ##########`);
const a = await run({});
console.log(`\nresult: ${a.answer ? "answer returned" : "no answer"}`);

console.log("\n\n########## CASE B — same task, cap lowered to 1 ##########");
const b = await run({ maxIterations: 1 });
console.log(`\nresult: ${b.answer === null ? "null — aborted by the cap, as expected" : b.answer}`);

console.log(`\nComputed cost, both cases: ${usd(estimateCost(MODEL, addUsage(addUsage({}, a.done.usage), b.done.usage)))}\n`);
check("Case A returned an answer", Boolean(a.answer?.trim()));
check("Case A ended on stop_reason, well below the cap", !a.cap && a.done.iterations < MAX_ITERATIONS, `${a.done.iterations} iterations`);
check("Case B fired the cap", Boolean(b.cap));
check("Case B stopped after one iteration", b.done.iterations === 1, `${b.done.iterations} iteration`);
check("Case B returned nothing, not a partial answer", b.answer === null);
finishChecks();
