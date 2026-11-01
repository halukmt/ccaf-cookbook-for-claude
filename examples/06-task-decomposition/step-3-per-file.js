// Live: each file in its own call, sequentially.

import { check, finishChecks } from "../../_shared/check.js";
import { CLEAN_FILES, CODEBASE_DIR, DEFECTS, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { estimateUsd, loadCodebase, perFileReview } from "./review.js";
import { saveResult } from "./saved.js";

const codebase = loadCodebase(CODEBASE_DIR);
const reviews = await perFileReview(codebase, {
  onFile: (r) => console.log(`${r.fileName.padEnd(18)} ${String(r.bugCount).padStart(2)} issues (${r.stopReason})`),
});
saveResult("per-file", reviews);

const issues = reviews.flatMap((r) => r.issues);
const score = scoreFindings(issues);
const localDefects = DEFECTS.filter((d) => d.scope === "local");
const localFound = localDefects.filter((d) => score.found.has(d.id));
console.log(`\nLocal defects found: ${localFound.length}/${localDefects.length}. Missed: ${localDefects.filter((d) => !score.found.has(d.id)).map((d) => d.id).join(", ") || "none"}`);
console.log(`Cross-file defects recognised anyway: ${DEFECTS.filter((d) => d.scope === "cross-file" && score.found.has(d.id)).map((d) => d.id).join(", ") || "none"}`);
console.log(`Issues on files with no planted local defect: ${CLEAN_FILES.map((f) => `${f}=${reviews.find((r) => r.fileName === f).bugCount}`).join(", ")}`);
console.log(`Cost estimate: $${estimateUsd(reviews.map((r) => r.usage)).usd.toFixed(4)}`);

check("Every file got its own review", reviews.length === codebase.size);
check("Every review finished on its own", reviews.every((r) => r.stopReason === "end_turn"));
check("Every line parsed", reviews.every((r) => r.brokenLines === 0));
check("Every issue has a line and a severity", issues.every((i) => Number.isInteger(i.line) && typeof i.severity === "string"));
check("Most local defects were found", localFound.length >= localDefects.length * 0.7, `${localFound.length}/${localDefects.length}`);

finishChecks();
