// Step 2, measured: how often does a contested category survive decomposition under a scope note?
// One run says little here, since the same prompt kept and dropped fusion on consecutive runs.
// Runs only the two decomposition calls, five times, one after another. Paid once: the result is
// saved, and a new paid run needs --force.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "./client.js";
import { emptyReport, enumerateCategories, normaliseSubtopics, validateAndDecompose } from "./coordinator.js";

const RUNS = 5;
const SCOPE_NOTE =
  "Include every technology proposed as a long-term primary energy source that is not fossil " +
  "fuel based, whether or not it meets a strict definition of 'renewable'. Pre-commercial and " +
  "contested candidates are in scope and must be listed with a caveat, not excluded.";

const store = resultStore(import.meta.url);
const runs = await store.runOnce("decomposition-stability", async () => {
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    const report = emptyReport("renewable energy technologies");
    report.goal = "Give a complete overview of the technologies in this topic.";
    report.breadthNote = "Technologies, maturity and enabling systems.";
    report.scopeNote = SCOPE_NOTE;
    const categories = await enumerateCategories(report);
    const decomposition = await validateAndDecompose(report, categories);
    const subtopics = normaliseSubtopics(decomposition.subtopics, "phase B");
    rows.push({ categories, subtopics, omittedOnPurpose: decomposition.omittedOnPurpose, usage: report.usage[FORCED_TOOL_MODEL] });
  }
  return rows;
});

const named = (run, word) => run.subtopics.some((s) => `${s.title} ${s.scope}`.toLowerCase().includes(word));
console.table(runs.map((run, i) => ({
  run: i + 1,
  subtopics: run.subtopics.length,
  fusionInFirstPass: run.categories.some((c) => c.toLowerCase().includes("fusion")),
  fusionInSubtopics: named(run, "fusion"),
  ownSubtopic: run.subtopics.some((s) => s.title.toLowerCase().includes("fusion")),
})));
const kept = runs.filter((run) => named(run, "fusion")).length;
const usage = runs.reduce((total, run) => addUsage(total, run.usage), {});
console.log(`Fusion reached the subtopics in ${kept} of ${runs.length} runs. Computed cost ${usd(estimateCost(FORCED_TOOL_MODEL, usage))}.\n`);

check(`All ${RUNS} runs were measured`, runs.length === RUNS);
check("Every run produced a decomposition", runs.every((run) => run.subtopics.length >= 5));
check("The five easy categories reached every run", runs.every((run) => ["solar", "wind", "geothermal", "tidal"].every((word) => named(run, word))));
check("The scope note does not name the answer", !SCOPE_NOTE.toLowerCase().includes("fusion"));
finishChecks();
