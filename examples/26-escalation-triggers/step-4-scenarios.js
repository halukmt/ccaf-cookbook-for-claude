// Step 4: four core scenarios, plus three added cases. Prompt-only: the code gate is off here, so this measures the
// prompt. One run per scenario. Paid once and saved.

import { check, finishChecks } from "../../_shared/check.js";
import { MODEL } from "../../_shared/client.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { processScenario } from "./engine.js";

const store = resultStore(import.meta.url);

export const SCENARIOS = [
  { id: "frustrated", input: "I am SO fed up! My order showed up damaged!", accepts: ["replied", "resolved"], forbid: "escalate", reason: "Core: resolvable, must not escalate. No order is named, so asking for it counts" },
  { id: "policy-gap", input: "Please match the lower price a competitor is charging.", accepts: ["escalate", "escalate_immediate"], trigger: "policy_gap", reason: "Core: policy is silent" },
  { id: "human", input: "I want to speak with a real human.", accepts: ["escalate_immediate"], trigger: "explicit_human_request", reason: "Core: no investigation" },
  { id: "ambiguous", input: "My name is John Smith, can you find my account?", accepts: ["disambiguate"], reason: "Core: two records" },
  { id: "frustrated-with-details", input: "This is SO frustrating! My order ORD-12345 arrived broken! I'm Anna Weber, anna.weber@example.com.", accepts: ["resolved"], reason: "Added: enough detail to finish the job" },
  { id: "policy-violation", input: "I'm Anna Weber, anna.weber@example.com. I changed my mind about order ORD-12345 and want to return it.", accepts: ["replied"], reason: "Added: 59 days old, so policy says no. Not a gap" },
  { id: "tool-failure", input: "I'm Anna Weber, anna.weber@example.com. Where is my order ORD-12345?", accepts: ["escalate"], trigger: "inability_to_progress", sessionOptions: { failOrderLookups: true }, reason: "Added and forced: the order system is simulated as down" },
];

const run = await store.runOnce("scenarios", async () => {
  const results = [];
  for (const scenario of SCENARIOS) {
    results.push({ id: scenario.id, ...(await processScenario(scenario.input, scenario.sessionOptions ?? {})) });
    console.log(`${scenario.id}: ${results.at(-1).action}`);
  }
  return { model: MODEL, results };
});

const get = (id) => run.results.find((r) => r.id === id);
console.table(run.results.map((r) => ({ id: r.id, action: r.action, tools: r.tools.join(" > ") || "-", investigated: r.investigationSteps, trigger: r.trigger ?? "-" })));
for (const r of run.results) console.log(`\n[${r.id}] ${r.text}`);
const total = run.results.reduce((sum, r) => addUsage(sum, r.usage), {});
console.log(`\nComputed cost ${usd(estimateCost(run.model, total))}.`);

check("Every scenario ran and has an answer", SCENARIOS.every((s) => get(s.id)?.text?.length > 0));
for (const scenario of SCENARIOS) {
  const result = get(scenario.id);
  check(`${scenario.id}: action is ${scenario.accepts.join(" or ")}`, scenario.accepts.includes(result.action), `got ${result.action}. ${scenario.reason}`);
  if (scenario.trigger) check(`${scenario.id}: trigger is ${scenario.trigger}`, result.trigger === scenario.trigger, `got ${result.trigger}`);
}
check("The frustrated customers were not escalated", !get("frustrated").tools.includes("escalate_to_human") && !get("frustrated-with-details").tools.includes("escalate_to_human"));
check("The explicit request had zero investigation", get("human").investigationSteps === 0 && get("human").tools[0] === "escalate_to_human");
check("The ambiguous reply asks for an identifier and names no record", /email|phone|order|postcode/i.test(get("ambiguous").text) && !/C-100|London|New York/.test(get("ambiguous").text));
check("A replacement went to the right order", get("frustrated-with-details").toolInputs.some((c) => c.name === "issue_replacement" && c.input.order_id === "ORD-12345" && c.input.customer_id === "C-1001"));
finishChecks();
