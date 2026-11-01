// Live: one real CLI run on a temp copy, covering all five steps. Tool calls are read from the stream,
// and the outcome from the files and by running the migrated code.

import { mkdirSync, writeFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { fixtureHash, createRefactorWorkspace, judgeRun, runRefactor } from "./refactor-lab.js";

const before = fixtureHash();
const workspace = createRefactorWorkspace();
const run = await runRefactor(workspace);

run.toolCalls.forEach((call, index) => {
  const target = call.input.pattern ?? String(call.input.file_path ?? "").split(/[\\/]/).pop();
  const extra = call.input.replace_all ? " replace_all" : "";
  console.log(`${String(index + 1).padStart(2)}. ${call.name.padEnd(5)} ${target}${extra}${call.isError ? "  -> ERROR" : ""}`);
});
const failedEdit = run.toolCalls.find((call) => call.name === "Edit" && call.isError);
console.log(`\nFirst failed Edit said: ${failedEdit?.resultText ?? "(none)"}`);
console.log(`\nAnswer: ${run.text}`);
console.log(`\nCost $${run.costUsd.toFixed(4)}, ${run.turns} turns, ${run.durationSeconds}s.`);

mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./results/run.json", import.meta.url),
  JSON.stringify({ costUsd: run.costUsd, turns: run.turns, toolCalls: run.toolCalls.map(({ name, input, isError, resultText }) => ({ name, input, isError, resultText: resultText?.slice(0, 300) })) }, null, 2)
);

check("The run succeeded", run.exitCode === 0 && !run.isError, run.stderr);
for (const [label, pass, detail] of judgeRun(run.toolCalls, workspace.work)) check(label, pass, detail);
check("Isolation held: private instructions were not sent", run.isolation.requests > 0 && !run.isolation.privateInstructionsSent);
check("The fixture itself was not modified", fixtureHash() === before);
finishChecks();
