// Steps 1 and 2: one call for the whole PR, then one call per file, one after another. Paid once.
// The passes are reused from the task decomposition pipeline, not copied.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL } from "../../_shared/client.js";
import { perFileReview, positionSlope, singlePassReview } from "../../examples/06-task-decomposition/review.js";
import { CROSS_DEFECTS, LOCAL_DEFECTS, PR_DEFECTS, PR_ORDER, contradictions, loadPr, perFileProfile, scorePr } from "./pr.js";

const store = resultStore(import.meta.url);
const pr = loadPr();

const single = await store.runOnce("single-pass", () => singlePassReview(pr));
const perFile = await store.runOnce("per-file", () => perFileReview(pr));
const perFileIssues = perFile.flatMap((r) => r.issues);

const singleProfile = perFileProfile(single.issues);
const multiProfile = perFileProfile(perFileIssues);
console.log("Per file, in review order:");
console.table(PR_ORDER.map((file, i) => ({
  pos: i + 1, file, planted: singleProfile[i].planted,
  singleCaught: singleProfile[i].caught, multiCaught: multiProfile[i].caught,
  singleFindings: singleProfile[i].findings, multiFindings: multiProfile[i].findings,
  singleChars: singleProfile[i].avgChars, multiChars: multiProfile[i].avgChars,
})));

const singleScore = scorePr(single.issues);
const multiScore = scorePr(perFileIssues);
const halves = (rows) => [rows.slice(0, 5), rows.slice(5)].map((part) => {
  const withFindings = part.filter((r) => r.findings);
  return Math.round(withFindings.reduce((sum, r) => sum + r.avgChars, 0) / (withFindings.length || 1));
});
console.log(`Single pass: ${single.issues.length} findings, local ${singleScore.local.length} of ${LOCAL_DEFECTS.length}, cross-file ${singleScore.cross.length} of ${CROSS_DEFECTS.length}. Missed: ${singleScore.missed.join(", ") || "none"}.`);
console.log(`Per file:    ${perFileIssues.length} findings, local ${multiScore.local.length} of ${LOCAL_DEFECTS.length}, cross-file ${multiScore.cross.length} of ${CROSS_DEFECTS.length}. Missed: ${multiScore.missed.join(", ") || "none"}.`);
console.log(`Findings matching no planted defect: single ${singleScore.unmatched}, per file ${multiScore.unmatched}.`);
console.log(`Finding length, first five files vs last five: single ${halves(singleProfile).join(" vs ")}, per file ${halves(multiProfile).join(" vs ")} characters.`);
console.log(`Slope of findings by position: single ${positionSlope(singleProfile.map((r) => r.findings)).toFixed(2)}, per file ${positionSlope(multiProfile.map((r) => r.findings)).toFixed(2)}.`);
console.log("Planted repeats, single pass:");
console.log(JSON.stringify(contradictions(single.issues), null, 1));

const costs = {
  single: estimateCost(MODEL, single.usage),
  perFile: estimateCost(MODEL, perFile.reduce((t, r) => addUsage(t, r.usage), {})),
};
console.log(`Computed cost: single ${usd(costs.single)}, per file ${usd(costs.perFile)}.`);

const middleSql = ["reports.js", "auth.js"].map((file) => singleProfile.find((r) => r.file === file));
const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectations going in, against this run:");
console.log(`  Single pass misses an obvious bug in a middle file                 ${yesNo(middleSql.some((r) => r.caught < r.planted))}`);
console.log(`  Single pass gives later files shallower findings (20% or more)     ${yesNo(halves(singleProfile)[1] < halves(singleProfile)[0] * 0.8)}`);
console.log(`  Single pass flags a repeated pattern in one file but not another   ${yesNo(contradictions(single.issues).some((c) => c.missedSomewhere))}`);
console.log(`  Per-file passes catch what the single pass missed                  ${yesNo(multiScore.local.length > singleScore.local.length)}`);

check("The PR has ten files, with the fixture's defects scored inside it", pr.size === 10 && PR_DEFECTS.length === 19, `${LOCAL_DEFECTS.length} local, ${CROSS_DEFECTS.length} cross-file`);
check("The single pass finished normally", single.stopReason === "end_turn" && single.brokenLines === 0, single.stopReason);
check("Every per-file pass finished normally", perFile.every((r) => r.stopReason === "end_turn" && r.brokenLines === 0));
check("Findings name real files", single.issues.every((i) => pr.has(i.file)));
check("Each file got its own pass", perFile.length === 10);
check("Scoring can say no", scorePr([{ file: "cart.js", description: "Looks fine to me." }]).found.size === 0);
finishChecks();
