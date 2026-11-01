// Step 1: detailed instructions, no examples, ten documents, three runs. Paid once, then read back.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { fixtureProblems } from "../../_fixtures/documents-answers.js";
import { BASE_PROMPT, STRUCTURES, TEST_DOCS, measure, pct, runAll, sumUsage } from "./extract.js";

const problems = fixtureProblems();
check("The answer key agrees with itself", problems.length === 0, problems.join("; "));
for (const [structure, wanted] of [["table", 3], ["narrative", 3], ["mixed", 4]]) {
  check(`${wanted} ${structure} documents in the test set`, TEST_DOCS.filter((d) => d.structure === structure).length === wanted);
}

const store = resultStore(import.meta.url);
const runs = await store.runOnce("baseline", () => runAll(BASE_PROMPT, TEST_DOCS, 3));
const m = measure(runs);

console.log(`Accuracy ${pct(m.accuracy)} of ${m.tally.fields} fields. Empty ${m.tally.empty} of ${m.tally.present} fields that exist. Fabricated ${m.tally.fabricated} of ${m.tally.absent} fields that do not.`);
console.log(`Well formed ${m.wellFormed} of ${m.answers} answers. Same result across runs for ${m.stableDocs} of ${m.docs} documents.`);
for (const structure of STRUCTURES) {
  const part = measure(runs, TEST_DOCS.filter((d) => d.structure === structure));
  console.log(`  ${structure.padEnd(10)} accuracy ${pct(part.accuracy)} of ${part.tally.fields}`);
}
console.log(`About ${usd(estimateCost(FAST_MODEL, sumUsage(runs)))} at list price.`);

check("Thirty answers exist", m.answers === 30);
check("No answer was cut off", runs.flat().every((row) => row.stopReason === "end_turn"));
check("Scoring can say no: an empty answer is not correct", measure([TEST_DOCS.map((d) => ({ id: d.id, output: null, usage: {} }))]).accuracy < 0.5);
finishChecks();
