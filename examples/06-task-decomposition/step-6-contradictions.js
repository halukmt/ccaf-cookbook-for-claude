// Looks for the same pattern judged differently within one run. No model, no cost.

import { check, finishChecks } from "../../_shared/check.js";
import { findContradictions, handlerErrorCoverage } from "./compare.js";
import { loadResult } from "./saved.js";

const single = loadResult("single-pass").issues;
const perFile = loadResult("per-file").flatMap((review) => review.issues);

function report(label, issues) {
  console.log(`\n=== ${label} ===`);
  const results = findContradictions(issues);
  for (const { pattern, sites, contradiction, severities } of results) {
    const flagged = sites.filter((s) => s.flagged).map((s) => s.file);
    const passed = sites.filter((s) => !s.flagged).map((s) => s.file);
    console.log(`${pattern}: flagged in [${flagged}], passed over in [${passed}], severities [${severities}]${contradiction ? "  CONTRADICTION" : ""}`);
  }
  const { handlers, flagged } = handlerErrorCoverage(issues);
  console.log(`Unplanned repeat, async handlers with no error handling: lines ${handlers}, flagged at ${flagged.length ? flagged : "none"}`);
  return { results, handlers, flagged };
}

const singleReport = report("Single pass", single);
const multiReport = report("Per-file passes", perFile);

const planted = singleReport.results.filter((r) => r.contradiction).length;
const unplanned = singleReport.flagged.length > 0 && singleReport.flagged.length < singleReport.handlers.length;
console.log(`\nSingle pass: ${planted} contradictions on planted repeats. Unplanned repeat judged inconsistently: ${unplanned}.`);

check("Both planted patterns were evaluated in each run", singleReport.results.length === 2 && multiReport.results.length === 2);
check("Each pattern has three sites", singleReport.results.every((r) => r.sites.length === 3));
check("The detector can report a contradiction", findContradictions([{ file: "auth.js", severity: "high", description: "SQL injection" }]).some((r) => r.contradiction));
check("The three handlers are located in the source", singleReport.handlers.length >= 3);
check("Per-file passes treated the planted repeats consistently", multiReport.results.every((r) => !r.contradiction));
check(
  "Observed in the saved run: the single pass flagged fewer of the identical handlers than the per-file passes",
  singleReport.flagged.length < multiReport.flagged.length,
  `${singleReport.flagged.length} vs ${multiReport.flagged.length} of ${singleReport.handlers.length}`
);

finishChecks();
