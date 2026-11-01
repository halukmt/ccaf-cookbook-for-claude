// Step 3: integration over structured findings, and the same with extracted interfaces added, since the earlier pipeline showed findings alone may not be enough. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL } from "../../_shared/client.js";
import { CROSS_DEFECTS, loadPr, scorePr } from "./pr.js";
import { integrationPass } from "./passes.js";

const store = resultStore(import.meta.url);
const pr = loadPr();
const perFile = store.load("per-file");

const findingsOnly = await store.runOnce("integration-findings", () => integrationPass(pr, perFile));
const withContracts = await store.runOnce("integration-contracts", () => integrationPass(pr, perFile, { contracts: true }));

const line = (name, r) => {
  const score = scorePr(r.issues);
  return { input: name, findings: r.issues.length, crossFound: `${score.cross.length} of ${CROSS_DEFECTS.length}`, which: score.cross.join(", ") || "none", stop: r.stopReason, cost: usd(estimateCost(MODEL, r.usage)) };
};
console.table([line("structured findings", findingsOnly), line("findings plus interfaces", withContracts)]);
const byCategory = (r) => r.issues.reduce((c, i) => ({ ...c, [i.category]: (c[i.category] ?? 0) + 1 }), {});
console.log("Categories, findings only:", byCategory(findingsOnly));
console.log("Categories, with interfaces:", byCategory(withContracts));

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectation going in, against this run:");
console.log(`  An integration pass over findings finds cross-file issues   ${yesNo(scorePr(findingsOnly.issues).cross.length === CROSS_DEFECTS.length)} (${scorePr(findingsOnly.issues).cross.length} of ${CROSS_DEFECTS.length})`);

const contractsScore = scorePr(withContracts.issues);
check("Both passes finished normally", [findingsOnly, withContracts].every((r) => r.stopReason === "end_turn" && r.brokenLines === 0));
check("Both returned cross-file issues", findingsOnly.issues.length > 0 && withContracts.issues.length > 0);
check("Every issue names more than one file", [...findingsOnly.issues, ...withContracts.issues].every((i) => i.files?.length > 1));
check("Interfaces find at least as many planted defects as findings alone", contractsScore.cross.length >= scorePr(findingsOnly.issues).cross.length);
check("With interfaces, every planted cross-file defect in the PR is found", contractsScore.cross.length === CROSS_DEFECTS.length, contractsScore.cross.join(", "));
finishChecks();
