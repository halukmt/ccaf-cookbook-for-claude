// Step 5: the aggregation shape, then one cheap pair of calls on a long input. One run per arm on Haiku:
// that is a single observation, not a rate. Filler follows a fixed pattern; there is no randomness.

import { check, finishChecks } from "../../_shared/check.js";
import { client, FAST_MODEL } from "../../_shared/client.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { aggregateFlat, aggregateWithKeyFindings } from "./case-facts.js";

const store = resultStore(import.meta.url);
const COUNT = 80;
// Each planted recall sits in one report. Positions 39 and 41 are the middle of the input.
const PLANTED = { 3: "Alder Foods", 39: "Mistral Grain", 41: "Osprey Dairy", 77: "Yarrow Oils" };
// Deliberately not in the key findings line: a summary only protects what it names.
const SECONDARY = { position: 40, supplier: "Nimbus Packaging" };

export function buildSources() {
  return Array.from({ length: COUNT }, (_, index) => {
    const position = index + 1;
    const name = PLANTED[position] ?? (position === SECONDARY.position ? SECONDARY.supplier : `Supplier ${String(position).padStart(2, "0")}`);
    const routine = `${name} delivered ${100 + position} pallets in the quarter against a plan of ${98 + position}. On-time delivery was ${90 + (position % 9)} percent. ` +
      `Invoices were reconciled within ${10 + (position % 7)} days. The account manager met the buyer twice and agreed the next quarter's volumes. ` +
      "Packaging waste fell slightly and the supplier's audit certificate stays valid until next spring. No changes to pricing were discussed. ";
    const planted = PLANTED[position] ? `In week ${position % 12 + 1}, ${name} issued a product safety recall for one production batch. ` : "";
    const secondary = position === SECONDARY.position ? `Separately, ${name} issued a minor safety recall for a small run of lids in week 6. ` : "";
    return {
      name,
      keyClaim: PLANTED[position] ? "Safety recall of one production batch." : "Routine quarter, deliveries near plan.",
      fullContent: routine + planted + secondary + routine,
    };
  });
}

const QUESTION = "Which suppliers in these reports issued a product safety recall? Answer as a plain list of supplier names and nothing else.";

async function ask(content) {
  const response = await client.messages.create({ model: FAST_MODEL, max_tokens: 300, messages: [{ role: "user", content: `${content}\n\n${QUESTION}` }] });
  return { text: response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), usage: response.usage };
}

const sources = buildSources();
const aggregated = aggregateWithKeyFindings(sources);
const summaryPart = aggregated.slice(0, aggregated.indexOf("## Full findings"));

check("Key findings come first", aggregated.startsWith("## Key findings at a glance"));
check("Details come after the key findings", aggregated.indexOf("## Full findings") > aggregated.lastIndexOf("- Supplier 80"));
check("Every source has a key finding line and a detail header", sources.every((s) => aggregated.includes(`- ${s.name}: `) && aggregated.includes(`### ${s.name}\n`)));
check("A planted middle item is flagged before the details start", /Mistral Grain: Safety recall/.test(summaryPart));
check("The secondary recall has no flag in the summary", /Nimbus Packaging: Routine/.test(summaryPart));

const run = await store.runOnce("key-findings", async () => ({
  model: FAST_MODEL,
  flat: await ask(aggregateFlat(sources)),
  keyFirst: await ask(aggregated),
}));

const expected = [...Object.values(PLANTED), SECONDARY.supplier];
const scored = (text) => expected.filter((name) => text.includes(name));
for (const [label, arm] of [["flat", run.flat], ["key findings first", run.keyFirst]]) {
  console.log(`${label}: ${arm.usage.input_tokens} input tokens, found ${scored(arm.text).length} of ${expected.length}, missing: ${expected.filter((n) => !arm.text.includes(n)).join(", ") || "none"}`);
}
console.log(`Computed cost ${usd(estimateCost(run.model, addUsage(addUsage({}, run.flat.usage), run.keyFirst.usage)))}.`);

check("Both answers name at least one planted supplier", scored(run.flat.text).length > 0 && scored(run.keyFirst.text).length > 0);
check("Key findings first finds every recall named in its summary", Object.values(PLANTED).every((n) => run.keyFirst.text.includes(n)));
store.save("key-findings-score", { expected, flat: scored(run.flat.text), keyFirst: scored(run.keyFirst.text), inputTokens: run.flat.usage.input_tokens });
finishChecks();
