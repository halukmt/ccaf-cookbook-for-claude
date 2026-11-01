// Step 5: which categories exceed 25% false positives, what disabling them does to the remaining
// findings, and whether the refined criteria would allow bringing them back.
// The category figures use the saved comparison at no cost. The re-enable test is one paid set of runs.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { SNIPPETS } from "../../_fixtures/review-snippets.js";
import { pct, runPrompt, summarise, sumUsage } from "./review.js";
import { DISABLE_ABOVE, REENABLE_TARGET, REFINED_PROMPT, REFINEMENTS, decideCategories, withoutCategories } from "./trust-recovery.js";

const store = resultStore(import.meta.url);
const data = store.load("step-4-compare");

const show = (label, decisions) => {
  console.log(`\n${label}`);
  console.table(decisions.map((d) => ({ category: d.category, correct: d.correct, falsePositive: d.falsePositive, rate: `${pct(d.fpRate)} of ${d.judged}`, unjudged: d.unjudged, action: d.action })));
};

const vagueDecisions = decideCategories(data.vague, SNIPPETS);
const explicitDecisions = decideCategories(data.explicit, SNIPPETS);
show("Vague prompt, per category", vagueDecisions);
show("Explicit prompt, per category", explicitDecisions);

const disabled = explicitDecisions.filter((d) => d.action === "disable").map((d) => d.category);
const before = summarise(data.explicit, SNIPPETS);
const after = summarise(withoutCategories(data.explicit, disabled), SNIPPETS);
console.log(`\nDisabled on the explicit prompt: ${disabled.join(", ") || "none"}`);
console.log(`Precision ${pct(before.precision)} -> ${pct(after.precision)}; false positives ${before.counts.fp} -> ${after.counts.fp} of ${after.falsePositiveSample}; recall ${pct(before.recall)} -> ${pct(after.recall)} of ${after.recallSample}.`);

const refined = await store.runOnce("step-5-refined", async () => {
  const runs = [];
  for (let run = 0; run < 3; run++) runs.push(await runPrompt(REFINED_PROMPT, SNIPPETS));
  return { model: data.model, runs };
});
const refinedSummary = summarise(refined.runs, SNIPPETS);
const refinedDecisions = decideCategories(refined.runs, SNIPPETS);
show("Refined prompt, per category, nothing disabled", refinedDecisions);
console.log(`Refined: false positives ${refinedSummary.counts.fp} of ${refinedSummary.falsePositiveSample} (${pct(refinedSummary.falsePositiveRate)}), recall ${pct(refinedSummary.recall)} of ${refinedSummary.recallSample}, unstable ${pct(refinedSummary.inconsistency.rate)} of ${refinedSummary.inconsistency.sample}.`);
console.log(`About ${usd(estimateCost(refined.model, sumUsage(refined.runs)))} for the refined runs.`);

const plan = disabled.map((category) => {
  const rate = refinedDecisions.find((d) => d.category === category);
  return {
    category,
    measuredRate: explicitDecisions.find((d) => d.category === category).fpRate,
    measuredSample: explicitDecisions.find((d) => d.category === category).judged,
    refinement: REFINEMENTS[category] ?? null,
    targetRate: REENABLE_TARGET,
    refinedRate: rate?.fpRate ?? 0,
    refinedSample: rate?.judged ?? 0,
    decision: !rate || rate.fpRate <= REENABLE_TARGET ? "may be re-enabled, on a fresh test set" : "stay disabled",
  };
});
store.save("refinement-plan", { threshold: DISABLE_ABOVE, plan });
console.log("\nRe-enablement plan:");
console.log(JSON.stringify(plan.map(({ refinement, ...rest }) => rest), null, 2));

check("Rates are computed for categories that have data", explicitDecisions.length > 0 && explicitDecisions.every((d) => d.correct + d.falsePositive + d.unjudged > 0));
check("The threshold really decides", decideCategories([[{ id: "safe-sql", findings: [{ category: "style", severity: "minor" }] }]], SNIPPETS)[0].action === "disable");
check("Disabling removes only the named category", withoutCategories([[{ id: "a", findings: [{ category: "style" }, { category: "logic" }] }]], ["style"])[0][0].findings.length === 1);
check("Disabling did not lose a true positive", after.counts.tp === before.counts.tp, `${before.counts.tp} -> ${after.counts.tp}`);
check("Every disabled category has refinements with at least two code examples", disabled.every((c) => REFINEMENTS[c]?.examples.length >= 2));
check("The refined prompt still finds every reportable snippet", refinedSummary.recall === 1, `${refinedSummary.counts.tp} of ${refinedSummary.recallSample}`);
finishChecks();
