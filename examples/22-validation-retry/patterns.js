// Turns logged findings into refinement priorities. Pure functions.
//
// There are no developers here to dismiss anything, so `wasDismissed` is SIMULATED from the answer
// key: a reviewer would dismiss a line item whose amount is not one of the document's real charges.

import { DOCUMENTS, getDocument, lineItemSum } from "../../_fixtures/documents-answers.js";

export function findingsFrom(results) {
  const findings = [];
  for (const [id, result] of Object.entries(results)) {
    const doc = getDocument(id);
    const remaining = doc.fields.line_items.map((item) => Math.round(item.amount * 100));
    const alternative = (doc.acceptAmounts ?? []).flat().map((amount) => Math.round(amount * 100));
    for (const item of result.line_items ?? []) {
      const cents = Math.round(item.amount * 100);
      const at = remaining.indexOf(cents);
      if (at !== -1) remaining.splice(at, 1);
      const known = at !== -1 || alternative.includes(cents);
      findings.push({
        doc: id,
        description: item.description,
        amount: item.amount,
        detected_pattern: item.detected_pattern ?? "unlabelled",
        wasDismissed: !known && !doc.unscored?.includes("line_items"),
      });
    }
  }
  return findings;
}

// Impact is frequency times dismissal rate, so a frequent noisy pattern outranks a rare one.
export function patternPriorities(findings) {
  const stats = {};
  for (const finding of findings) {
    const line = (stats[finding.detected_pattern] ??= { total: 0, dismissed: 0 });
    line.total++;
    if (finding.wasDismissed) line.dismissed++;
  }
  return Object.entries(stats)
    .map(([pattern, s]) => ({ pattern, total: s.total, dismissed: s.dismissed, dismissalRate: s.dismissed / s.total, impact: s.dismissed }))
    .sort((a, b) => b.impact - a.impact || b.total - a.total);
}

// How far the model's self-assessment can be trusted, measured against code and against the key.
export function selfReportAccuracy(results) {
  const rows = Object.entries(results).map(([id, result]) => {
    const doc = getDocument(id);
    const sum = lineItemSum(result.line_items ?? []);
    return {
      doc: id,
      calculatedRight: Math.abs(sum - result.calculated_total) < 0.01,
      flagRight: result.total_discrepancy === (result.stated_total !== null && Math.abs(sum - result.stated_total) > 0.01),
      documentHasError: Boolean(doc.errors?.length),
      conflictDetected: result.conflict_detected === true,
    };
  });
  const count = (test) => rows.filter(test).length;
  return {
    rows,
    documents: rows.length,
    calculatedRight: count((r) => r.calculatedRight),
    flagRight: count((r) => r.flagRight),
    realConflicts: count((r) => r.documentHasError),
    conflictsCaught: count((r) => r.documentHasError && r.conflictDetected),
    falseConflicts: count((r) => !r.documentHasError && r.conflictDetected),
  };
}

export const ALL_IDS = DOCUMENTS.map((d) => d.id);
