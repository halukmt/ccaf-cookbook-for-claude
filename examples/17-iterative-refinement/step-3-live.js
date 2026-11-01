// PAID, small: test-driven iteration through the blueprint's feedback loop, with real tests and a real model.
// The first prompt is deliberately one sentence and the test file is out of the model's reach, so what it learns
// about the edge cases comes only from failure output.
// Tests are not simply shared up front, because a model that reads them all first has nothing to iterate on.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { testFeedbackLoop } from "../../blueprints/refinement/scripts/test-feedback-loop.js";
import { newWorkspace, sumCost } from "./refine-lab.js";

const workspace = newWorkspace("tdd");
const testDir = join(workspace.work, "test");
const hidden = join(workspace.root, "hidden-tests");
mkdirSync(hidden);
cpSync(testDir, hidden, { recursive: true });
rmSync(testDir, { recursive: true });

function runTests() {
  cpSync(hidden, testDir, { recursive: true });
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap"], { cwd: workspace.work, encoding: "utf8" });
  rmSync(testDir, { recursive: true });
  return run.stdout;
}

const turns = [];
const ask = async ({ prompt, sessionId }) => {
  const options = { tools: "Read,Edit", allowedTools: "Read,Edit", budgetUsd: 0.2 };
  const run = sessionId
    ? await runGuarded(workspace, prompt, { ...options, preflight: false, extraArgs: ["--resume", sessionId] })
    : await runGuarded(workspace, prompt, options);
  turns.push(run);
  return { sessionId: run.sessionId };
};

const loop = await testFeedbackLoop({
  prompt: 'In dates/format-date.js, implement formatDate(input) so that "2024-01-15" gives "15 January 2024". Edit only that file.',
  ask,
  test: async () => runTests(),
  maxRounds: 4,
});

for (const round of loop.rounds) console.log(`Round ${round.round}: ${round.failing.length} failing${round.failing.length ? `: ${round.failing.join("; ")}` : ""}`);
console.log(`\nFinal implementation:\n${readFileSync(join(workspace.work, "dates/format-date.js"), "utf8")}`);
console.log(`Total cost: $${sumCost(turns).toFixed(4)}`);

const counts = loop.rounds.map((round) => round.failing.length);
check("the first round left failures, so there was something to iterate on", counts[0] > 0, `${counts[0]} failing`);
check("the loop ended with all tests passing", loop.passed, `rounds: ${counts.join(" -> ")}`);
check("failures never increased from one round to the next", counts.every((count, index) => index === 0 || count <= counts[index - 1]));
check("every resumed turn kept the same session", new Set(turns.map((turn) => turn.sessionId)).size === 1);
check("only the named file was edited", turns.flatMap((turn) => turn.toolCalls).filter((call) => call.name === "Edit" && !call.isError).every((call) => String(call.input.file_path).replace(/\\/g, "/").endsWith("dates/format-date.js")));
check("the guard refused nothing and no request held private content", !turns.some((turn) => turn.blocked > 0 || turn.privateSeen));
finishChecks();
