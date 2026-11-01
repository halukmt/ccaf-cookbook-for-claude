// Disabling noisy categories, and the refined criteria that are the condition for bringing one back.
// Pure functions except for the refined prompt text.

import { EXPLICIT_PROMPT, categoryRates } from "./review.js";

export const DISABLE_ABOVE = 0.25;
export const REENABLE_TARGET = 0.15;

// A rate on two findings says little, so the sample stays next to the decision.
export function decideCategories(runs, snippets) {
  return categoryRates(runs, snippets).map((line) => ({
    ...line,
    action: line.fpRate > DISABLE_ABOVE ? "disable" : "keep",
  }));
}

// A disabled category is removed by code after the model answers, so it cannot leak back in.
export function withoutCategories(runs, disabled) {
  return runs.map((rows) =>
    rows.map((row) => ({ ...row, findings: row.findings.filter((f) => !disabled.includes(f.category)) }))
  );
}

// Written after reading the false positives of the explicit run. Each edge case has code, and none
// of it is copied from the test snippets.
export const REFINEMENTS = {
  style: {
    issue: "Two names for one value were reported as style although style is on the skip list.",
    fix: "Skip examples for a naming mismatch and a redundant alias.",
    examples: [
      "const orderId = getId();\nconst order_id = orderId; // skip: same value, naming only",
      "let total_price = 0;\nlet totalTax = 0; // skip: mixed naming in one function",
      "const result = compute();\nreturn result; // skip: a redundant variable",
    ],
  },
  logic: {
    issue: "A speculative failure was reported on correct code: an awaited call might throw.",
    fix: "Skip examples where an exception simply propagates to the caller, and one that must still be reported.",
    examples: [
      "// Retries twice.\nasync function pull() { for (let i = 0; i < 2; i++) { if (await get()) return true; } return false; } // skip: a throw reaching the caller is not a contradiction",
      "async function save(row) { await db.insert(row); } // skip: no handler needed here",
      "const first = items[items.length]; // report: always undefined, so name the input that breaks it",
    ],
  },
};

export const REFINED_PROMPT = `${EXPLICIT_PROMPT}

Edge cases, decided in advance:
${Object.values(REFINEMENTS).flatMap((r) => r.examples).map((example) => example.replace(/^/gm, "  ")).join("\n\n")}`;
