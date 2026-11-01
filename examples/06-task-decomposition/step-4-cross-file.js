// Live: the integration pass, on summaries and the import graph only. Pass --contracts for the
// variant that also receives extracted interfaces and call sites.

import { check, finishChecks } from "../../_shared/check.js";
import { CODEBASE_DIR, DEFECTS, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { crossFilePass, estimateUsd, loadCodebase } from "./review.js";
import { loadResult, saveResult } from "./saved.js";

const mode = process.argv.includes("--contracts") ? "contracts" : "summaries";
const codebase = loadCodebase(CODEBASE_DIR);
const reviews = loadResult("per-file");

const result = await crossFilePass(codebase, reviews, { mode });
saveResult(`cross-file-${mode}`, result);

for (const issue of result.issues) console.log(`[${issue.severity}] ${issue.files.join(" + ")}: ${issue.description}`);

const score = scoreFindings(result.issues);
const planted = DEFECTS.filter((d) => d.scope === "cross-file");
const hits = planted.filter((d) => score.found.has(d.id));
console.log(`\nMode: ${mode}. Planted cross-file defects found: ${hits.length}/${planted.length}: ${hits.map((d) => d.id).join(", ") || "none"}`);
console.log(`Response blocks: ${result.blockTypes.join(", ")}. Output tokens: ${result.usage.output_tokens}`);
console.log(`stop_reason: ${result.stopReason}. Cost estimate: $${estimateUsd([result.usage]).usd.toFixed(4)}`);

check("The pass returned issues", result.issues.length > 0, `${result.issues.length} issues`);
check("Every issue names real files", result.issues.every((i) => Array.isArray(i.files) && i.files.every((f) => codebase.has(f))));
check("Every issue involves more than one file", result.issues.every((i) => new Set(i.files).size > 1));
check("The response was not cut off", result.stopReason === "end_turn");
if (mode === "contracts") check("With contracts, most planted cross-file defects are found", hits.length >= planted.length * 0.6, `${hits.length}/${planted.length}`);

finishChecks();
