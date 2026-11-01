// Compares the saved runs. No model, no cost. The checks test the figures and what this run really
// showed, and the lines marked "Prediction" report whether a common expectation held.

import { check, finishChecks } from "../../_shared/check.js";
import { DEFECTS } from "../../_fixtures/codebase-answers.js";
import { buildComparison } from "./compare.js";
import { estimateUsd, stdDev } from "./review.js";
import { loadResult } from "./saved.js";

const single = loadResult("single-pass");
const perFile = loadResult("per-file");
const crossSummaries = loadResult("cross-file-summaries");
const crossContracts = loadResult("cross-file-contracts");
const result = buildComparison({ single, perFile, crossSummaries, crossContracts });

console.log("=== Consistency comparison ===");
console.table(result.rows);
console.log("=== Planted defects found ===");
console.table(result.defects);

const row = (name, s, m) => console.log(`${name.padEnd(36)} single=${String(s).padEnd(8)} per-file=${m}`);
const f2 = (v) => v.toFixed(2);
row("Total findings", result.single.total, result.multi.total);
row("Findings matching no planted defect", result.single.unmatched, result.multi.unmatched);
row("Local defects found (of 16)", result.single.score.found.size - result.cross.single.length, result.multi.score.found.size - result.cross.perFile.length);
row("Std dev of issues per file", f2(result.single.stdDev), f2(result.multi.stdDev));
row("Std dev of local recall per file", f2(result.single.recallStdDev), f2(result.multi.recallStdDev));
row("Slope of issues by file position", f2(result.single.countSlope), f2(result.multi.countSlope));
row("Detail, first half (chars)", f2(result.single.detailFirstHalf), f2(result.multi.detailFirstHalf));
row("Detail, second half (chars)", f2(result.single.detailSecondHalf), f2(result.multi.detailSecondHalf));
row("Line within 2 of the planted line", f2(result.single.lineAccuracy), f2(result.multi.lineAccuracy));

console.log("\nCross-file defects found, of 6:");
console.log(`  Single pass:                      ${result.cross.single.join(", ") || "none"}`);
console.log(`  Per-file passes:                  ${result.cross.perFile.join(", ") || "none"}`);
console.log(`  Integration, summaries only:      ${result.cross.summaries.join(", ") || "none"}`);
console.log(`  Integration, with contracts:      ${result.cross.contracts.join(", ") || "none"}`);

const cost = {
  single: estimateUsd([single.usage]),
  perFile: estimateUsd(perFile.map((r) => r.usage)),
  crossSummaries: estimateUsd([crossSummaries.usage]),
  crossContracts: estimateUsd([crossContracts.usage]),
};
console.log(`\nEstimated cost: single $${cost.single.usd.toFixed(3)}, per-file $${cost.perFile.usd.toFixed(3)}, cross summaries $${cost.crossSummaries.usd.toFixed(3)}, cross contracts $${cost.crossContracts.usd.toFixed(3)}`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nCommon expectations, against this one run:");
console.log(`  Prediction: multi-pass finds more total issues                    ${yesNo(result.multi.total > result.single.total)}`);
console.log(`  Prediction: single-pass issue counts drop off for later files     ${yesNo(result.single.countSlope < result.multi.countSlope - 0.25)}`);
console.log(`  Prediction: single-pass detail shrinks for later files             ${yesNo(result.single.detailSecondHalf < result.single.detailFirstHalf * 0.8 && result.multi.detailSecondHalf >= result.multi.detailFirstHalf * 0.9)}`);
console.log(`  Prediction: multi-pass has the lower standard deviation           ${yesNo(result.multi.stdDev < result.single.stdDev)}`);
console.log(`  Prediction: cross-file issues are caught only by the integration  ${yesNo(result.cross.single.length === 0)}`);

check("The figures rest on real data", result.single.total > 0 && result.multi.total > 0);
check("All twelve files are compared", result.rows.length === 12);
check("Std dev is computed correctly", Math.abs(stdDev([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-9);
check("Every defect has a row", result.defects.length === DEFECTS.length);
check("Per-file passes found every local defect", result.defects.filter((d) => d.scope === "local").every((d) => d.perFile));
check("Integration with contracts found all six cross-file defects", result.cross.contracts.length === 6);
check("Integration with contracts beat summaries alone", result.cross.contracts.length > result.cross.summaries.length, `${result.cross.summaries.length} vs ${result.cross.contracts.length}`);

finishChecks();
