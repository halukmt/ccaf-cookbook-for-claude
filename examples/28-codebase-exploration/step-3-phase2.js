// Step 3: Phase 1 is summarised from structured findings, and the summary goes into every Phase 2 prompt.
// Needs results/phase1.json. Paid once and saved. A no-summary comparison was not run.

import { check, finishChecks } from "../../_shared/check.js";
import { FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { DEFECTS, loadCodebase, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { buildPhase2Prompt, delegateToSubagent, summarisePhase } from "./explorer.js";
import { PHASE2_TASKS } from "./tasks.js";
import { createWorkspace, exportsByFile } from "./workspace.js";

const store = resultStore(import.meta.url);
const phase1 = store.load("phase1");

const run = await store.runOnce("phase2", async () => {
  const { summary, usage: summaryUsage } = await summarisePhase(phase1.results.flatMap((r) => r.findings));
  const { code } = createWorkspace();
  const results = [];
  for (const task of PHASE2_TASKS) {
    const prompted = { ...task, task: buildPhase2Prompt(summary, task.task) };
    results.push({ defect: task.defect, ...(await delegateToSubagent(prompted, { code })) });
  }
  return { summaryModel: FORCED_TOOL_MODEL, model: MODEL, summary, summaryUsage, results };
});

console.log("Phase 1 summary:", JSON.stringify(run.summary, null, 2));
const phase1Reads = new Set(phase1.results.flatMap((r) => r.filesRead));
for (const r of run.results) {
  const found = scoreFindings(r.findings.map((f) => ({ files: f.filePaths, description: `${f.criticalNote} ${f.summary}` }))).found;
  r.foundDefect = found.has(r.defect);
  console.log(`\n${r.task}: read ${r.filesRead.join(", ") || "nothing"}. ${r.findings.at(-1).summary}\n  Critical: ${r.findings.at(-1).criticalNote}\n  Planted defect ${r.defect} found: ${r.foundDefect}`);
}
const reads = run.results.flatMap((r) => r.filesRead);
console.log(`\nPhase 2 file reads: ${reads.length}, of which ${reads.filter((f) => phase1Reads.has(f)).length} files Phase 1 had also read.`);
const cost = estimateCost(run.model, run.results.reduce((sum, r) => ({ input_tokens: sum.input_tokens + r.usage.input_tokens, output_tokens: sum.output_tokens + r.usage.output_tokens }), { input_tokens: 0, output_tokens: 0 })) + estimateCost(run.summaryModel, run.summaryUsage);
console.log(`Computed cost ${usd(cost)}.`);

const summaryText = JSON.stringify(run.summary);
const names = [...exportsByFile().values()].flat();
check("The summary has the required fields", ["architecture", "dependencyChain", "criticalIssue"].every((f) => run.summary[f]?.length > 10) && run.summary.targets.length > 0);
check("The summary's chain uses real function names", names.filter((name) => run.summary.dependencyChain.includes(name)).length >= 2);
const sourceLines = [...loadCodebase().values()].flatMap((source) => source.split("\n")).map((line) => line.trim()).filter((line) => line.length > 30);
check("The summary copies no line of source", !sourceLines.some((line) => summaryText.includes(line)), `${sourceLines.length} source lines compared`);
check("Every Phase 2 prompt carries the summary", run.results.every((r) => r.prompt.includes(run.summary.dependencyChain) && r.prompt.includes("Phase 2 Task")));
check("Phase 2 found both planted cross-file defects", run.results.every((r) => r.foundDefect), run.results.map((r) => `${r.defect} ${r.foundDefect}`).join(", "));
check("The defect ids come from the answer key", run.results.every((r) => DEFECTS.some((d) => d.id === r.defect)));

store.save("phase2-score", { reads: reads.length, reReads: reads.filter((f) => phase1Reads.has(f)).length, found: run.results.map((r) => ({ defect: r.defect, found: r.foundDefect })) });
finishChecks();
