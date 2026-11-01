// Steps 1 and 2: the coordinator delegates four investigations, each writing to a real scratchpad file in a temporary
// directory and reading it first. Paid once and saved. Sequential.

import { check, finishChecks } from "../../_shared/check.js";
import { client, MODEL } from "../../_shared/client.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { loadCodebase } from "../../_fixtures/codebase-answers.js";
import { join } from "node:path";
import { delegateToSubagent, readScratchpad } from "./explorer.js";
import { INVESTIGATIONS, TRUTH } from "./tasks.js";
import { createWorkspace, realFiles } from "./workspace.js";

const store = resultStore(import.meta.url);
const count = async (text) => (await client.messages.countTokens({ model: MODEL, messages: [{ role: "user", content: text }] })).input_tokens;

const run = await store.runOnce("phase1", async () => {
  const { root, code } = createWorkspace();
  const scratchpadPath = join(root, "exploration-scratchpad.md");
  const results = [];
  const padBeforeEach = [];
  for (const task of INVESTIGATIONS) {
    padBeforeEach.push(readScratchpad(scratchpadPath));
    results.push(await delegateToSubagent(task, { code, scratchpadPath }));
    console.log(`${task.subagent}: read ${results.at(-1).filesRead.join(", ") || "nothing"}`);
  }
  return { model: MODEL, results, padBeforeEach, scratchpad: readScratchpad(scratchpadPath) };
});

const allFindings = run.results.flatMap((r) => r.findings);
const coordinatorContext = JSON.stringify(run.results.map((r) => ({ task: r.task, findings: r.findings })));
const contextTokens = await count(coordinatorContext);
const codeTokens = await count([...loadCodebase().values()].join("\n"));
const subagentInput = run.results.reduce((sum, r) => addUsage(sum, r.usage), {});

console.log(`\nScratchpad:${run.scratchpad}`);
console.table(run.results.map((r) => ({ subagent: r.task, reads: r.filesRead.length, unique: new Set(r.filesRead).size, iterations: r.iterations, input: r.usage.input_tokens, output: r.usage.output_tokens })));
console.log(`What the coordinator holds: ${contextTokens} tokens. The code itself: ${codeTokens}. Input the subagents consumed: ${subagentInput.input_tokens}.`);
console.log(`Computed cost ${usd(estimateCost(run.model, subagentInput))}.`);

check("All four subagents reported", run.results.length === 4 && run.results.every((r) => r.findings.length > 0));
for (const result of run.results) {
  const truth = TRUTH[result.task](result.findings);
  check(`${result.task}: agrees with the real code`, truth.pass, truth.detail);
}
check("Every reported file really exists", allFindings.flatMap((f) => f.filePaths).every((file) => realFiles().has(file)));
check("The coordinator's context holds no raw source", !coordinatorContext.includes("createHash") && !coordinatorContext.includes("router.delete("));
check("The coordinator's context is much smaller than what subagents consumed", contextTokens * 3 < subagentInput.input_tokens, `${contextTokens} vs ${subagentInput.input_tokens}`);
check("The scratchpad holds specific file and function names", /payments\.js/.test(run.scratchpad) && /refundCharge/.test(run.scratchpad) && /placeOrder/.test(run.scratchpad));
check("The scratchpad grew with each subagent", run.padBeforeEach[0] === "" && run.padBeforeEach.every((pad, i) => i === 0 || pad.length > run.padBeforeEach[i - 1].length));
check("Later subagents received the scratchpad in their prompt", run.results.slice(1).every((r, i) => r.prompt.includes(run.padBeforeEach[i + 1].trim())));

store.save("phase1-size", { contextTokens, codeTokens, subagentInput: subagentInput.input_tokens });
finishChecks();
