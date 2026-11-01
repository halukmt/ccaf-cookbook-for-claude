// Step 5, free: the framework has enough criteria with examples, and it loads through a CLAUDE.md import.
// Pass --live to also spend a small amount: a real model classifies tasks using only this framework.

import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { repoRoot } from "../../_shared/client.js";
import { requestText, runGuarded, runStubbed, writeWorkspaceFile } from "../../_shared/config-lab.js";
import { newWorkspace } from "./plan-lab.js";

const FRAMEWORK = join(repoRoot, "blueprints", "plan-or-direct", "decision-framework.md");
const text = readFileSync(FRAMEWORK, "utf8");
const section = (start, end) => text.slice(text.indexOf(start), text.indexOf(end));
const rows = (body) => body.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Signal") && !line.startsWith("|---"));

check("at least four plan-mode criteria, each with an example", rows(section("## Plan first when", "## Execute directly when")).length >= 4);
check("at least three direct criteria, each with an example", rows(section("## Execute directly when", "## Ambiguous or difficult?")).length >= 3);
check("the ambiguity versus difficulty distinction is explicit", /ambiguity, not difficulty/i.test(text));

const workspace = newWorkspace("framework");
copyFileSync(FRAMEWORK, join(workspace.work, "decision-framework.md"));
writeWorkspaceFile(workspace.work, "CLAUDE.md", "@./decision-framework.md\n");
const loaded = await runStubbed(workspace, "hello");
const sent = requestText(loaded.requests[0]);
check("imported from CLAUDE.md, the framework reaches the request", sent.includes("Plan first or execute directly"));
check("its usage comment is stripped", !sent.includes("Replace the examples"));

// Each task has one right mode by the framework's own logic. The first two are the distinction itself.
const CASES = [
  { id: "hard-but-clear", task: "Fix a deadlock in the job scheduler. It has been isolated to acquireLock in scheduler.go line 212; the agreed fix is to take the two locks in a fixed order.", mode: "direct" },
  { id: "easy-but-open", task: "Add notifications to the app.", mode: "plan" },
  { id: "config-value", task: "Change the request timeout in config/http.json from 30 to 60 seconds.", mode: "direct" },
  { id: "service-boundary", task: "Split the monolith's billing code into its own service.", mode: "plan" },
  { id: "stack-trace", task: "TypeError at format.js line 3: user is undefined. Anonymous users should show as Guest.", mode: "direct" },
  { id: "unknown-cause", task: "Customers sometimes see duplicate invoices. We don't know why yet. Make it stop.", mode: "plan" },
];

if (process.argv.includes("--live")) {
  const schema = {
    type: "object",
    properties: { answers: { type: "array", items: { type: "object", properties: { id: { type: "string" }, mode: { type: "string", enum: ["plan", "direct"] } }, required: ["id", "mode"], additionalProperties: false } } },
    required: ["answers"],
    additionalProperties: false,
  };
  const prompt = `Using only the decision framework in your project instructions, classify each task as plan or direct.\n\n${CASES.map((item) => `${item.id}: ${item.task}`).join("\n")}`;
  const run = await runGuarded(workspace, prompt, { tools: "", budgetUsd: 0.2, extraArgs: ["--json-schema", JSON.stringify(schema)] });
  const answers = run.result?.structured_output?.answers ?? [];
  const correct = CASES.filter((item) => answers.find((answer) => answer.id === item.id)?.mode === item.mode);
  console.log(`Model answers ($${run.costUsd.toFixed(4)}):`, answers.map((answer) => `${answer.id}=${answer.mode}`).join(", "));
  check("live: all six classified as the framework says", correct.length === CASES.length, `${correct.length} of ${CASES.length}`);
  check("live: the guard refused nothing and no request held private content", run.blocked === 0 && !run.privateSeen);
}

finishChecks();
