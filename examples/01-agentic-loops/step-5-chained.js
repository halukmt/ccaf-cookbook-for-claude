// Step 5 — Test the loop with sequential, dependent tool calls.
//
// No new loop code. This step is the proof that the loop from steps 3 and 4 actually
// carries information across iterations.
//
// The prompt is chosen so it CANNOT be answered in one pass: the percentage cannot be
// calculated before the population is known. Claude has to search, receive the result,
// reason about it, and only then call the calculator.

import { check, finishChecks } from "../../_shared/check.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { runAgent } from "./agent-loop.js";
import { MODEL } from "./client.js";

const events = [];
const answer = await runAgent(
  "Look up the population of Germany, then calculate how many people 12% of that is.",
  { onEvent: (event) => events.push(event) }
);

console.log(`\nFINAL ANSWER:\n${answer}\n`);

const tools = events.filter((e) => e.type === "tool");
const done = events.find((e) => e.type === "done");
const lastIteration = events.filter((e) => e.type === "iteration").at(-1);
const searchIndex = tools.findIndex((t) => t.name === "web_search");
const calcIndex = tools.findIndex((t) => t.name === "calculator");
const calc = tools[calcIndex];

// A single-pass agent would have to guess the number. Check that the answer contains the figure
// that only the calculator could have produced from the searched value, in any usual notation.
const compact = (answer ?? "").replace(/[,\s.](?=\d{3}\b)/g, "");
const hasFigure = compact.includes("10020000") || /10[.,]02\s*million/i.test(answer ?? "");

console.log(`Computed cost: ${usd(estimateCost(MODEL, done.usage))}\n`);
check("The run ended on end_turn", lastIteration?.stopReason === "end_turn", lastIteration?.stopReason);
check("Search ran before the calculator", searchIndex !== -1 && calcIndex > searchIndex, tools.map((t) => t.name).join(" -> "));
check("The two calls came from separate iterations, since one depends on the other", done.iterations >= 3, `${done.iterations} iterations`);
check("The calculator used the value the search returned", calc?.input.expression.replace(/[,_]/g, "").includes("83500000"), calc?.input.expression);
check("The calculator produced the expected result", Math.abs((calc?.result?.result ?? 0) - 10020000) < 1, String(calc?.result?.result));
check("The final answer carries that figure", hasFigure);
finishChecks();
