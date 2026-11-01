// Live: every file in one prompt, in one call.

import { check, finishChecks } from "../../_shared/check.js";
import { CODEBASE_DIR, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { estimateUsd, loadCodebase, singlePassReview } from "./review.js";
import { saveResult } from "./saved.js";

const codebase = loadCodebase(CODEBASE_DIR);
const result = await singlePassReview(codebase);
saveResult("single-pass", result);

for (const name of codebase.keys()) {
  const issues = result.issues.filter((i) => i.file === name);
  console.log(`${name.padEnd(18)} ${String(issues.length).padStart(2)} issues`);
}
const score = scoreFindings(result.issues);
console.log(`\nstop_reason: ${result.stopReason}, broken lines: ${result.brokenLines}`);
console.log(`Planted defects found: ${score.found.size}. Missed: ${score.missed.join(", ")}`);
console.log(`Cost estimate: $${estimateUsd([result.usage]).usd.toFixed(4)}`);

check("The review returned issues", result.issues.length > 0, `${result.issues.length} issues`);
check("Every issue names a real file", result.issues.every((i) => codebase.has(i.file)));
check("Every issue has a line reference", result.issues.every((i) => Number.isInteger(i.line) && i.line > 0));
check("The answer key recognises at least one finding", score.found.size > 0);

finishChecks();
