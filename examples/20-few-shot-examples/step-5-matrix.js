// Step 5: which problem needs which technique, with the figures measured here beside each line.
// Three documents outside the main set probe what examples cannot fix: absent data and a document
// whose own total is wrong. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { getDocument, lineItemSum } from "../../_fixtures/documents-answers.js";
import { BASE_PROMPT, fewShotPrompt, formatProblems, measure, pct, runAll, sumUsage } from "./extract.js";

const PROBE_DOCS = ["d13", "d14", "d16"].map(getDocument);
const store = resultStore(import.meta.url);
const baseline = store.load("baseline");
const fewShot = store.load("few-shot");
const probes = await store.runOnce("probes", async () => ({
  baseline: await runAll(BASE_PROMPT, PROBE_DOCS, 3),
  fewShot: await runAll(fewShotPrompt(), PROBE_DOCS, 3),
}));

const before = measure(baseline);
const after = measure(fewShot);
const probeBefore = measure(probes.baseline, PROBE_DOCS);
const probeAfter = measure(probes.fewShot, PROBE_DOCS);

const fenced = (runs) => runs.flat().filter((row) => !row.bare).length;
// The document's total is 355 and its lines add to 335. An extraction can only show this; this schema has no field to say it.
const sumConflict = (runs) => runs.flat().filter((row) => row.id === "d16" && row.output).map((row) => ({ total: row.output.total_amount, sum: lineItemSum(row.output.line_items ?? []) }));
const conflictSilent = (rows) => rows.filter((r) => r.total !== r.sum).length;
// An invented line closes the gap, so the numbers look fine and nothing shows the problem any more.
const conflictPlugged = (rows) => rows.filter((r) => r.total === r.sum).length;

const matrix = [
  { problem: "Narrative documents coming back with empty fields", technique: "Worked few-shot examples", baseline: `${before.tally.empty} of ${before.tally.present}`, fewShot: `${after.tally.empty} of ${after.tally.present}`, verdict: "Could not be tested: the baseline had none" },
  { problem: "Judgement differing between runs", technique: "Few-shot examples", baseline: `${before.docs - before.stableDocs} of ${before.docs} docs`, fewShot: `${after.docs - after.stableDocs} of ${after.docs} docs`, verdict: "Too few to conclude" },
  { problem: "Invented partial date", technique: "Few-shot example, nullable field", baseline: `${before.tally.fabricated} of ${before.tally.absent}`, fewShot: `${after.tally.fabricated} of ${after.tally.absent}`, verdict: "Improved by one case in six" },
  { problem: "Fabrication on sparse documents", technique: "Nullable schema fields", baseline: `${probeBefore.tally.fabricated} of ${probeBefore.tally.absent}`, fewShot: `${probeAfter.tally.fabricated} of ${probeAfter.tally.absent}`, verdict: "Measured, see notes" },
  { problem: "Reply wrapped in a code fence", technique: "tool_use or structured output", baseline: `${fenced(baseline)} of 30`, fewShot: `${fenced(fewShot)} of 30`, verdict: "Examples did not fix it" },
  { problem: "Line items do not add up to the total", technique: "A validation loop in code", baseline: `${conflictSilent(sumConflict(probes.baseline))} of 3 kept the gap, ${conflictPlugged(sumConflict(probes.baseline))} invented a line to close it`, fewShot: `${conflictSilent(sumConflict(probes.fewShot))} of 3 kept the gap, ${conflictPlugged(sumConflict(probes.fewShot))} invented a line to close it`, verdict: "Examples cannot flag it" },
  { problem: "Wrong tool selected", technique: "Better tool descriptions", baseline: "not applicable", fewShot: "not applicable", verdict: "Not tested here, no tools in this prompt" },
];
console.table(matrix);
console.log("Probe answers, fields fabricated by outcome:");
console.table(PROBE_DOCS.map((doc) => ({
  doc: doc.id,
  baseline: JSON.stringify(probes.baseline[0].find((r) => r.id === doc.id).output),
  fewShot: JSON.stringify(probes.fewShot[0].find((r) => r.id === doc.id).output),
})));
store.save("matrix", { matrix, before: { accuracy: before.accuracy }, after: { accuracy: after.accuracy } });
console.log(`Accuracy on the ten: ${pct(before.accuracy)} -> ${pct(after.accuracy)}. Probes about ${usd(estimateCost(FAST_MODEL, sumUsage([...probes.baseline, ...probes.fewShot])))}.`);

check("Every problem has a technique", matrix.every((row) => row.technique));
check("All probe answers parsed", [...probes.baseline.flat(), ...probes.fewShot.flat()].every((row) => row.output));
const allConflict = [...sumConflict(probes.baseline), ...sumConflict(probes.fewShot)];
check("The wrong stated total was kept in all six answers", allConflict.length === 6 && allConflict.every((r) => r.total === 355));
check("Each answer either shows the gap or closed it, and none of them can flag it", allConflict.every((r) => r.sum === 335 || r.sum === 355), allConflict.map((r) => r.sum).join(", "));
check("Format checker can say no", formatProblems({ bare: true, output: { document_date: "May 3", total_amount: "5", line_items: "x" } }).length === 3);
finishChecks();
