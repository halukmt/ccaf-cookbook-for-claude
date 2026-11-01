// Free: the blueprint's commands expand as they should, and the feedback loop works with a scripted model and
// real test runs. Also finds out what the interview's natural tool, AskUserQuestion, does under -p.

import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { toolResultsSent } from "../../_shared/api-capture.js";
import { check, finishChecks } from "../../_shared/check.js";
import { labEnv, requestText, runStubbed, startStubApi, toolUse } from "../../_shared/config-lab.js";
import { failuresFromTap, feedbackMessage, testFeedbackLoop } from "../../blueprints/refinement/scripts/test-feedback-loop.js";
import { BLUEPRINT, newWorkspace } from "./refine-lab.js";

const promptOf = (run) => run.requests[0].messages[0].content.at(-1).text;
const workspace = newWorkspace("commands");

const interview = await runStubbed(workspace, "/interview-first a caching layer for the API");
check("blueprint /interview-first: expands with the argument", promptOf(interview).includes("a caching layer for the API") && promptOf(interview).includes("5 to 10 targeted questions"));
check("blueprint /interview-first: usage notes are not sent", !promptOf(interview).includes("Copy to .claude/commands"));
const batch = await runStubbed(workspace, "/batch-fixes three error changes");
check("blueprint /batch-fixes: expands with the argument", promptOf(batch).includes("three error changes") && promptOf(batch).includes("one shared structure"));
const transform = await runStubbed(workspace, "/transform-by-example Input: a Output: b. Apply to: c");
check("blueprint /transform-by-example: expands with the argument", promptOf(transform).includes("Input: a Output: b. Apply to: c"));

// AskUserQuestion under -p: is an interview possible through the tool?
const asked = await runStubbed(newWorkspace("ask"), "Ask me.", {
  allowedTools: "AskUserQuestion",
  script: (_, index) => (index === 0 ? [toolUse("AskUserQuestion", { questions: [{ question: "TTL?", header: "TTL", options: [{ label: "60 s", description: "short" }, { label: "1 h", description: "long" }], multiSelect: false }] })] : "done"),
});
const askResult = toolResultsSent(asked.requests).find((result) => result.toolName === "AskUserQuestion");
console.log(`AskUserQuestion under -p: error=${askResult?.isError}, result: ${askResult?.text?.slice(0, 120)}`);
check("under -p, AskUserQuestion cannot get an answer from a person", askResult?.isError === true || !/60 s|1 h/.test(askResult?.text ?? ""));

// The loop, with a scripted implementer and the real test runner's output format.
const TAP = `TAP version 13
# Subtest: a passes
ok 1 - a passes
# Subtest: b fails
not ok 2 - b fails
  ---
  error: 'Expected values to be strictly equal'
  code: 'ERR_ASSERTION'
  expected: 'x'
  actual: 'y'
  ...
`;
const parsed = failuresFromTap(TAP);
check("failuresFromTap finds the failing test with expected and actual", parsed.length === 1 && parsed[0].name === "b fails" && parsed[0].detail.some((line) => line.includes("expected")));
check("feedbackMessage carries them", feedbackMessage(parsed).includes("FAIL b fails") && feedbackMessage(parsed).includes("actual: 'y'"));

// A failed assert.throws reports its message as a block scalar. An earlier version kept only the "error: |-" line.
const BLOCK_TAP = `not ok 1 - rejects bad input
  ---
  duration_ms: 1.5
  error: |-
    The input did not match the regular expression /Invalid date format/. Input:

    'Error: Invalid date: x'

  code: 'ERR_ASSERTION'
  stack: |-
    at somewhere
  ...
`;
const blockDetail = failuresFromTap(BLOCK_TAP)[0].detail.join("\n");
check("failuresFromTap keeps a multi-line error message", blockDetail.includes("/Invalid date format/") && blockDetail.includes("Invalid date: x"));
check("failuresFromTap leaves out the stack", !blockDetail.includes("at somewhere") && !blockDetail.includes("duration_ms"));

const script = [TAP, "TAP version 13\nok 1 - a passes\nok 2 - b fails\n"];
const prompts = [];
const loop = await testFeedbackLoop({
  prompt: "start",
  ask: async ({ prompt, sessionId }) => { prompts.push({ prompt, sessionId }); return { sessionId: "s1" }; },
  test: async () => script.shift(),
});
check("loop: stops as soon as tests pass", loop.passed && loop.rounds.length === 2);
check("loop: round 2 resumes the session and sends the failures", prompts[1].sessionId === "s1" && prompts[1].prompt.includes("FAIL b fails"));
const stuck = await testFeedbackLoop({ prompt: "start", maxRounds: 2, ask: async () => ({ sessionId: "s" }), test: async () => TAP });
check("loop: reports failure at the limit", !stuck.passed && stuck.rounds.length === 2);

// The command-line wrapper itself, spawning the real CLI, against the stub.
async function runWrapper(testCommand) {
  const scratch = newWorkspace("wrapper");
  const stub = await startStubApi();
  const env = labEnv(scratch, { apiKey: "sk-ant-stub-not-a-real-key", baseUrl: stub.url, extra: { HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost" } });
  const script = join(BLUEPRINT, "scripts", "test-feedback-loop.js");
  const outcome = await new Promise((done) => {
    const child = spawn(process.execPath, [script, "--prompt", "Do it.", "--test", testCommand, "--max-rounds", "2", "--model", "claude-haiku-5-5"], { cwd: scratch.work, env });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stdout += chunk));
    child.on("close", (code) => done({ code, stdout }));
  });
  await stub.close();
  return { ...outcome, requests: stub.requests };
}
const failing = await runWrapper("node --test --test-reporter=tap");
check("wrapper: exits 1 when tests still fail at the limit", failing.code === 1 && /Round 2: \d+ failing/.test(failing.stdout), failing.stdout.trim().split("\n").join(" | "));
check("wrapper: its second round really resumed with the failures", requestText(failing.requests.at(-1)).includes("still fail"));
const passing = await runWrapper("echo ok 1 - all good");
check("wrapper: exits 0 when tests pass", passing.code === 0 && /Round 1: 0 failing/.test(passing.stdout), passing.stdout.trim());

check("no captured request holds private content", ![interview, batch, transform, asked].some((run) => run.privateSeen) && !hasPrivateContent(JSON.stringify(failing.requests)));
finishChecks();
