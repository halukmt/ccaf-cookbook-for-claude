#!/usr/bin/env node
// Iterates on a task by feeding real test failures back into the same Claude Code session until the tests
// pass or the round limit is reached. Exits 0 only if the tests pass.
//
//   node test-feedback-loop.js --prompt "Implement X in src/x.js" --test "node --test --test-reporter=tap"
//       [--max-rounds 4] [--tools Read,Edit] [--budget 0.5] [--model claude-haiku-5-5]
//
// Needs `claude` on PATH and ANTHROPIC_API_KEY. It lets the given tools run unattended, so run it on a checkout you can discard.

import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Keeps what a person would read from TAP output: which test failed, what was expected and what came instead.
// The values may be YAML block scalars ("error: |-" and indented lines). Without those lines the model sees
// that a test failed, but not why.
const KEPT_KEY = /^\s*(error|expected|actual):/;
const ANY_KEY = /^\s*[A-Za-z]+:/;

export function failuresFromTap(tap) {
  const lines = tap.split("\n");
  const failures = [];
  lines.forEach((line, index) => {
    const match = /^\s*not ok \d+ - (.+)$/.exec(line);
    if (!match) return;
    const detail = [];
    let keeping = false;
    for (const next of lines.slice(index + 1, index + 60)) {
      if (/^\s*(not )?ok \d+ - /.test(next) || /^\s*\.\.\.\s*$/.test(next)) break;
      if (KEPT_KEY.test(next)) keeping = true;
      else if (ANY_KEY.test(next)) keeping = false;
      if (keeping) detail.push(next.trim());
    }
    failures.push({ name: match[1], detail: detail.slice(0, 20) });
  });
  return failures;
}

export function feedbackMessage(failures) {
  const body = failures.map((failure) => `FAIL ${failure.name}\n  ${failure.detail.join("\n  ")}`).join("\n");
  return `The tests were run. ${failures.length} still fail:\n\n${body}\n\nMake targeted fixes for these. Do not change what already passes.`;
}

// `ask({ prompt, sessionId })` runs one turn and returns { sessionId }. `test()` returns TAP text.
// Both are parameters so the loop itself can be tested and reused with another runner.
export async function testFeedbackLoop({ prompt, ask, test, maxRounds = 4 }) {
  const rounds = [];
  let message = prompt;
  let sessionId;
  for (let round = 1; round <= maxRounds; round += 1) {
    const turn = await ask({ prompt: message, sessionId });
    sessionId = turn.sessionId;
    const failures = failuresFromTap(await test());
    rounds.push({ round, failing: failures.map((failure) => failure.name), turn });
    if (failures.length === 0) return { passed: true, rounds, sessionId };
    message = feedbackMessage(failures);
  }
  return { passed: false, rounds, sessionId };
}

function askClaude({ tools, budget, model }) {
  return ({ prompt, sessionId }) =>
    new Promise((done, fail) => {
      const args = ["-p", "--output-format", "json", "--permission-mode", "dontAsk", "--allowedTools", tools, "--max-budget-usd", budget];
      if (model) args.push("--model", model);
      if (sessionId) args.push("--resume", sessionId);
      const child = spawn("claude", args, { stdio: ["pipe", "pipe", "inherit"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.on("error", fail);
      child.on("close", () => {
        try {
          const result = JSON.parse(stdout);
          if (result.is_error) fail(new Error(result.result ?? "claude reported an error"));
          else done({ sessionId: result.session_id, costUsd: result.total_cost_usd });
        } catch {
          fail(new Error(`Unexpected output from claude: ${stdout.slice(0, 300)}`));
        }
      });
      child.stdin.end(prompt);
    });
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prompt = option("prompt");
  const testCommand = option("test");
  if (!prompt || !testCommand) {
    console.error('Usage: test-feedback-loop.js --prompt "..." --test "<command that prints TAP>"');
    process.exit(2);
  }
  const result = await testFeedbackLoop({
    prompt,
    maxRounds: Number(option("max-rounds", 4)),
    ask: askClaude({ tools: option("tools", "Read,Edit"), budget: option("budget", "0.5"), model: option("model") }),
    test: () => spawnSync(testCommand, { shell: true, encoding: "utf8" }).stdout,
  });
  for (const round of result.rounds) console.log(`Round ${round.round}: ${round.failing.length} failing`);
  process.exit(result.passed ? 0 : 1);
}
