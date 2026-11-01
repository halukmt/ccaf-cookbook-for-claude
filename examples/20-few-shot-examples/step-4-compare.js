// Step 4: the same ten documents with the few-shot prompt, three runs, against the baseline.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { STRUCTURES, TEST_DOCS, failures, fewShotPrompt, measure, pct, runAll, sumUsage } from "./extract.js";

const store = resultStore(import.meta.url);
const baseline = store.load("baseline");
const fewShot = await store.runOnce("few-shot", () => runAll(fewShotPrompt(), TEST_DOCS, 3));

const line = (name, m) => ({
  run: name,
  accuracy: `${pct(m.accuracy)} of ${m.tally.fields}`,
  emptyFields: `${m.tally.empty} of ${m.tally.present}`,
  fabricated: `${m.tally.fabricated} of ${m.tally.absent}`,
  wrong: m.tally.wrong,
  wellFormed: `${m.wellFormed} of ${m.answers}`,
  stableDocs: `${m.stableDocs} of ${m.docs}`,
});

const before = measure(baseline);
const after = measure(fewShot);
console.table([line("baseline", before), line("few-shot", after)]);
console.table(STRUCTURES.flatMap((structure) => {
  const docs = TEST_DOCS.filter((d) => d.structure === structure);
  return [line(`${structure}, baseline`, measure(baseline, docs)), line(`${structure}, few-shot`, measure(fewShot, docs))];
}));
console.log("Remaining failures with examples:");
console.table(failures(fewShot));
console.log(`Few-shot runs: about ${usd(estimateCost(FAST_MODEL, sumUsage(fewShot)))}, baseline ${usd(estimateCost(FAST_MODEL, sumUsage(baseline)))}.`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectations going in, against this run:");
console.log(`  Fewer empty fields                       ${yesNo(after.tally.empty < before.tally.empty)}  (${before.tally.empty} -> ${after.tally.empty})`);
console.log(`  Better format consistency                ${yesNo(after.formatRate > before.formatRate)}  (${before.wellFormed} -> ${after.wellFormed} of ${after.answers})`);
console.log(`  Higher accuracy                          ${yesNo(after.accuracy > before.accuracy)}  (${pct(before.accuracy)} -> ${pct(after.accuracy)})`);
const narrative = TEST_DOCS.filter((d) => d.structure === "narrative");
console.log(`  Narrative documents gain the most        ${yesNo(measure(fewShot, narrative).accuracy - measure(baseline, narrative).accuracy > after.accuracy - before.accuracy)}`);

check("Both prompts ran three times over ten documents", baseline.length === 3 && fewShot.length === 3 && fewShot.every((rows) => rows.length === 10));
check("No answer was cut off", fewShot.flat().every((row) => row.stopReason === "end_turn"));
check("Every few-shot answer parsed", fewShot.flat().every((row) => row.output));
finishChecks();
