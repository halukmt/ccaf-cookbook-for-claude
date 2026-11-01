// Step 5: extract all 20 documents once, log detected_pattern per line item, and rank patterns by
// simulated dismissals. Also measures the model's own totals and flags. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { documentText, getDocument } from "../../_fixtures/documents-answers.js";
import { extract, sumOf } from "./extraction.js";
import { ALL_IDS, findingsFrom, patternPriorities, selfReportAccuracy } from "./patterns.js";

const store = resultStore(import.meta.url);
const log = await store.runOnce("pattern-log", async () => {
  const out = {};
  for (const id of ALL_IDS) out[id] = await extract(documentText(getDocument(id)));
  return out;
});

const results = Object.fromEntries(Object.entries(log).map(([id, row]) => [id, row.result]));
const findings = findingsFrom(results);
const priorities = patternPriorities(findings);
console.log(`${findings.length} line items over ${ALL_IDS.length} documents. Dismissals are SIMULATED from the answer key.`);
console.table(priorities.map((p) => ({ ...p, dismissalRate: `${(p.dismissalRate * 100).toFixed(0)}% of ${p.total}` })));
console.log("Dismissed line items:");
console.table(findings.filter((f) => f.wasDismissed));

const self = selfReportAccuracy(results);
console.log(`calculated_total right: ${self.calculatedRight} of ${self.documents}. total_discrepancy right: ${self.flagRight} of ${self.documents}.`);
console.log(`conflict_detected: ${self.conflictsCaught} of ${self.realConflicts} real conflicts, ${self.falseConflicts} false alarms on ${self.documents - self.realConflicts} documents without one.`);
console.table(self.rows.filter((r) => !r.calculatedRight || !r.flagRight || r.conflictDetected !== r.documentHasError));
console.log(`About ${usd(estimateCost(FORCED_TOOL_MODEL, sumOf(Object.values(log).map((row) => row.usage))))} at list price.`);

check("All twenty documents were extracted", Object.keys(log).length === 20);
check("Every line item has a pattern", findings.length > 0 && findings.every((f) => f.detected_pattern !== "unlabelled"));
check("Ranking puts the highest impact first", priorities.every((p, i) => i === 0 || priorities[i - 1].impact >= p.impact));
check("Dismissal logic can say yes", findingsFrom({ d01: { line_items: [{ amount: 1, detected_pattern: "other" }] } })[0].wasDismissed === true);
check("Dismissal logic can say no", findingsFrom({ d01: { line_items: [{ amount: 120, detected_pattern: "table_row" }] } })[0].wasDismissed === false);
check("The ranking formula is right", patternPriorities([{ detected_pattern: "a", wasDismissed: true }, { detected_pattern: "a", wasDismissed: true }, { detected_pattern: "a", wasDismissed: false }, { detected_pattern: "b", wasDismissed: true }])[0].pattern === "a");
finishChecks();
