// Step 1: the vague prompt on the five core snippets, one run. Paid once, then read back.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { CORE_SNIPPETS } from "../../_fixtures/review-snippets.js";
import { VAGUE_PROMPT, rates, runPrompt, scoreRun, sumUsage, topSeverity } from "./review.js";

const store = resultStore(import.meta.url);
const rows = await store.runOnce("step-1-vague", () => runPrompt(VAGUE_PROMPT, CORE_SNIPPETS));

console.table(rows.map((row) => {
  const snippet = CORE_SNIPPETS.find((s) => s.id === row.id);
  return { snippet: row.id, expected: snippet.report ? snippet.severity : "skip", got: topSeverity(row.findings), findings: row.findings.length };
}));
const counts = scoreRun(rows, CORE_SNIPPETS);
const rate = rates(counts);
console.log("Counts:", counts);
console.log(`False positives on ${counts.fp} of ${rate.falsePositiveSample} snippets that should be skipped. About ${usd(estimateCost(FAST_MODEL, sumUsage([rows])))}.`);

check("All five snippets got a parsed answer", rows.length === 5 && rows.every((row) => Array.isArray(row.findings)));
check("The test set covers report and skip cases", CORE_SNIPPETS.some((s) => s.report) && CORE_SNIPPETS.some((s) => !s.report));
check("The SQL injection was flagged", rows.find((row) => row.id === "sql-injection").findings.length > 0);
check("Scoring adds up", counts.tp + counts.fn + counts.fp + counts.tn === 5);
finishChecks();
