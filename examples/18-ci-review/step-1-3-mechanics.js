// Steps 1 to 3, free. Which CLI flags really behave as CI needs, and how the blueprint's pipeline uses them. A real CLI
// against the stub, so a misbehaving model can be scripted on demand. No GitHub call is made, and a trap `gh` proves it.

import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { repoRoot } from "../../_shared/client.js";
import { createLabWorkspace, labEnv, requestText, runStubbed, startStubApi, toolUse, writeWorkspaceFile } from "../../_shared/config-lab.js";
import { buildPrCalls, buildReviewPrompt, commentableLines, mergeFindings, parseEnvelope } from "../../blueprints/ci-review/scripts/ci-review.js";
import { CI_SECTION_MARK, installGhTrap, newRepo, parseDryRun, PIPELINE, push, runPipelineStubbed } from "./ci-lab.js";

const SCHEMA = JSON.parse(readFileSync(join(repoRoot, "blueprints", "ci-review", "schemas", "findings.schema.json"), "utf8"));
const FINDING = { file: "src/orders/repository.js", line: 7, severity: "critical", message: "SQL built by concatenation.", evidence: "findByEmail: (email) => database.query", previous_id: null };
const envelopeOf = (run) => JSON.parse(run.stdout);
const scratch = createLabWorkspace("flags");
const schemaArgs = ["--json-schema", JSON.stringify(SCHEMA)];

// --- Step 1: -p, and what happens without it ------------------------------------------------------------

const help = await new Promise((done) => {
  const child = spawn("claude", ["--help"], { env: labEnv(scratch, { apiKey: "x", baseUrl: "http://127.0.0.1:9" }) });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.on("close", () => done(stdout));
});
for (const flag of ["-p, --print", "--output-format", "--json-schema", "--max-budget-usd", "--allowedTools", "--disallowedTools", "--no-session-persistence"]) {
  check(`--help lists ${flag}`, help.includes(flag));
}
check("--help does not list --max-turns in this version", !help.includes("--max-turns"));

const printed = await runStubbed(scratch, "Analyse this.", { outputFormat: "text", script: () => "ANALYSIS-TEXT" });
check("step 1: -p prints to stdout and exits 0", printed.exitCode === 0 && printed.stdout.includes("ANALYSIS-TEXT"));

// No -p and no terminal: you might expect the job to hang. Tested with stdin closed, as on most runners, and with
// stdin left open, as under a wrapper holding a pipe. A timeout decides "hangs".
async function withoutPrint(stdinOpen) {
  const api = await startStubApi({ script: () => "ANSWER-WITHOUT-P" });
  const env = labEnv(scratch, { apiKey: "sk-ant-stub", baseUrl: api.url, extra: { HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost" } });
  const outcome = await new Promise((done) => {
    const child = spawn("claude", ["Analyse this."], { cwd: scratch.work, env, stdio: [stdinOpen ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const timer = setTimeout(() => { child.kill(); done({ timedOut: true, stdout }); }, 20000);
    child.on("close", (code) => { clearTimeout(timer); done({ timedOut: false, code, stdout }); });
  });
  await api.close();
  return { ...outcome, requests: api.requests.length };
}
const closedStdin = await withoutPrint(false);
const openStdin = await withoutPrint(true);
console.log(`Without -p, stdin closed: ${JSON.stringify({ ...closedStdin, stdout: closedStdin.stdout.slice(0, 80) })}`);
console.log(`Without -p, stdin open: ${JSON.stringify({ ...openStdin, stdout: openStdin.stdout.slice(0, 80) })}`);
check("no terminal and closed stdin does not hang here, it answers and exits", !closedStdin.timedOut && closedStdin.code === 0 && closedStdin.stdout.includes("ANSWER-WITHOUT-P"));
check("with stdin left open and no -p, it waits with no request: a real hang", openStdin.timedOut && openStdin.requests === 0);

// --- Step 2: --output-format json with --json-schema -----------------------------------------------------

const good = await runStubbed(scratch, "Review.", {
  outputFormat: "json",
  extraArgs: schemaArgs,
  script: (_, index) => (index === 0 ? [toolUse("StructuredOutput", { findings: [FINDING], resolved_ids: [] })] : "All done."),
});
const goodEnvelope = envelopeOf(good);
check("step 2: --json-schema adds a StructuredOutput tool to the request", good.requests[0].tools.some((tool) => tool.name === "StructuredOutput"));
check("step 2: it is not forced with tool_choice", good.requests[0].tool_choice === undefined);
check("step 2: the validated data lands in structured_output", goodEnvelope.structured_output?.findings?.[0]?.line === 7);
check("step 2: result is not the data, it is the model's closing text", goodEnvelope.result === "All done.");
check("the envelope carries a session id and a cost", Boolean(goodEnvelope.session_id) && typeof goodEnvelope.total_cost_usd === "number");

// A schema violation goes back to the model. Bound the run: a stub would otherwise answer forever.
let attempt = 0;
const invalid = await runStubbed(scratch, "Review.", {
  outputFormat: "json",
  extraArgs: schemaArgs,
  script: () => {
    attempt += 1;
    if (attempt === 1) return [toolUse("StructuredOutput", { findings: [{ file: "x" }], resolved_ids: [] })];
    if (attempt === 2) return [toolUse("StructuredOutput", { findings: [FINDING], resolved_ids: [] })];
    return "Fixed it.";
  },
});
check("a schema violation is returned to the model, which can correct it", envelopeOf(invalid).structured_output?.findings?.length === 1 && attempt === 3, `${attempt} requests`);

// Trap: a model that never calls the tool. The retry has no limit of its own, so these runs need a cap.
let plainCalls = 0;
const plainText = () => {
  plainCalls += 1;
  return "Here is my review in plain text.";
};
const unbounded = await runStubbed(scratch, "Review.", { outputFormat: "json", extraArgs: [...schemaArgs, "--max-turns", "6"], timeoutMs: 8000, script: plainText });
check("trap: a model answering in plain text is retried without end, and --max-turns does not stop it", plainCalls > 50 && unbounded.exitCode !== 0, `${plainCalls} requests in 8 s, then killed`);
plainCalls = 0;
const budgeted = await runStubbed(scratch, "Review.", { outputFormat: "json", budgetUsd: 0.0001, extraArgs: schemaArgs, timeoutMs: 30000, script: plainText });
const budgetEnvelope = budgeted.stdout.trim() ? JSON.parse(budgeted.stdout) : {};
check("--max-budget-usd does stop that loop", plainCalls > 1 && plainCalls < 50 && budgeted.exitCode !== null, `${plainCalls} requests, subtype ${budgetEnvelope.subtype}, exit ${budgeted.exitCode}, is_error ${budgetEnvelope.is_error}`);
let pipelineFailure = "";
try {
  parseEnvelope({ code: budgeted.exitCode, stdout: budgeted.stdout, stderr: "" }, { requireStructured: true });
} catch (error) {
  pipelineFailure = error.message;
}
check("trap: stopping on budget exits 0 with is_error false, so exit code alone reads as success", budgeted.exitCode === 0 && budgetEnvelope.is_error === false && budgetEnvelope.subtype === "error_max_budget_usd");
check("the pipeline's parser turns that result into a failure", pipelineFailure.includes("error_max_budget_usd"), pipelineFailure.slice(0, 120));
let plainFailure = "";
try {
  parseEnvelope({ code: 0, stdout: JSON.stringify({ is_error: false, subtype: "error_max_turns" }), stderr: "" });
} catch (error) {
  plainFailure = error.message;
}
check("the parser also fails a run with no schema that hit a limit", plainFailure.includes("error_max_turns"));

// --max-turns is not in --help. Does it still work where the model keeps calling tools?
let turnCalls = 0;
const turns = await runStubbed(scratch, "Go.", { outputFormat: "json", allowedTools: "Glob", extraArgs: ["--max-turns", "2"], timeoutMs: 8000, script: () => { turnCalls += 1; return [toolUse("Glob", { pattern: "*" })]; } });
const turnEnvelope = turns.stdout.trim() ? JSON.parse(turns.stdout) : {};
check("--max-turns still stops a tool loop, though --help omits it", turnCalls === 2 && turnEnvelope.subtype === "error_max_turns", `${turnCalls} requests, subtype ${turnEnvelope.subtype}, exit ${turns.exitCode}`);

// --- Step 3: findings to PR comments, as a dry run ---------------------------------------------------------

const DIFF = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,3 +10,4 @@ context
 unchanged
-removed
+added one
+added two
 unchanged again`;
const lines = commentableLines(DIFF).get("src/a.js");
check("commentableLines maps the new file's line numbers, including context lines", [10, 11, 12, 13].every((line) => lines.has(line)) && lines.size === 4);
const calls = buildPrCalls(
  [{ id: "F1", file: "src/a.js", line: 11, severity: "critical", message: "Bad." }, { id: "F2", file: "src/a.js", line: 99, severity: "minor", message: "Elsewhere." }],
  { repo: "o/r", pr: 7, commit: "abc" },
  DIFF,
);
check("a finding on a changed line becomes an inline comment with path, line, side and commit", calls[0].args.includes("repos/o/r/pulls/7/comments") && calls[0].payload.path === "src/a.js" && calls[0].payload.line === 11 && calls[0].payload.side === "RIGHT" && calls[0].payload.commit_id === "abc");
check("the severity is visible in its body", calls[0].payload.body.includes("[critical]"));
check("a finding outside the diff becomes a plain PR comment, rather than a rejected call", calls[1].args.includes("repos/o/r/issues/7/comments") && calls[1].payload.body.includes("src/a.js:99"));

// The pipeline end to end on a real temp repository, with a real diff.
const repo = newRepo("dry-run");
const commit = push(repo, 1);
const trap = installGhTrap(repo);
const store = join(repo.work, ".ci", "findings.json");
const pipeline = await runPipelineStubbed(repo, ["review", "--base", "main", "--store", store, "--repo", "acme/orders", "--pr", "42", "--commit", commit, "--model", "claude-haiku-5-5"], {
  extraPath: trap.dir,
  script: (_, index) => (index === 0 ? [toolUse("StructuredOutput", { findings: [FINDING, { ...FINDING, line: 2, severity: "major", message: "Secret in source.", evidence: "const API_SECRET" }], resolved_ids: [] })] : "done"),
});
console.log(pipeline.stdout);
const printedCalls = parseDryRun(pipeline.stdout);
const firstRequest = pipeline.requests[0];
check("pipeline: exits 0", pipeline.code === 0, pipeline.stderr.slice(0, 200));
check("pipeline: the prompt holds the real diff", requestText(firstRequest).includes('email = \'" + email'));
check("step 4 mechanics: CI reads CLAUDE.md under -p", requestText(firstRequest).includes(CI_SECTION_MARK));
check("pipeline: review tools are read-only", !firstRequest.tools.some((tool) => ["Bash", "Edit", "Write"].includes(tool.name)));
check("pipeline: findings are stored", existsSync(store) && JSON.parse(readFileSync(store, "utf8")).length === 2);
check("pipeline: both exact gh calls are printed", printedCalls.length === 2 && printedCalls.every((call) => call.command.includes("repos/acme/orders/")));
check("pipeline: the inline call names the head commit", printedCalls.find((call) => call.payload.path)?.payload.commit_id === commit);
check("pipeline: a dry run really did not call gh", !existsSync(trap.log));
check("pipeline: it reports nothing posted", pipeline.summary?.posted === 0);

const failing = await runPipelineStubbed(newRepoWithPush("fail-on"), ["review", "--base", "main", "--store", "s.json", "--fail-on", "critical", "--model", "claude-haiku-5-5"], {
  script: (_, index) => (index === 0 ? [toolUse("StructuredOutput", { findings: [FINDING], resolved_ids: [] })] : "done"),
});
check("--fail-on critical gives a distinct exit code for the CI gate", failing.code === 3, `exit ${failing.code}`);
const noChanges = await runPipelineStubbed(newRepo("no-changes"), ["review", "--base", "main", "--store", "s.json"], { script: () => { throw new Error("must not be called"); } });
check("no changes: exits 0 without calling the model", noChanges.code === 0 && noChanges.requests.length === 0);

function newRepoWithPush(label) {
  const created = newRepo(label);
  push(created, 1);
  return created;
}

// --- Pure logic of the incremental store, including a model that forgets one ------------------------------

const previous = [{ id: "F1", file: "a", line: 1, severity: "major", message: "one" }, { id: "F2", file: "a", line: 2, severity: "major", message: "two" }, { id: "F3", file: "a", line: 3, severity: "major", message: "three" }];
const merged = mergeFindings(previous, { findings: [{ file: "a", line: 9, severity: "major", message: "one, moved", previous_id: "F1" }, { file: "b", line: 5, severity: "minor", message: "new", previous_id: null }], resolved_ids: ["F2"] });
check("merge: a still-present finding keeps its id, and only new ones are posted", merged.toPost.length === 1 && merged.toPost[0].id === "F4" && merged.stillOpen.includes("F1"));
check("merge: a fixed one leaves the store", merged.resolved.includes("F2") && !merged.open.some((finding) => finding.id === "F2"));
check("merge: one the model forgot stays open and is flagged", merged.unaccounted.includes("F3") && merged.open.some((finding) => finding.id === "F3"));
const hallucinated = mergeFindings(previous, { findings: [{ file: "c", line: 1, severity: "minor", message: "x", previous_id: "F99" }], resolved_ids: [] });
check("merge: an invented previous_id counts as new", hallucinated.toPost.length === 1);
check("the review prompt names the rule on fixed findings", buildReviewPrompt("d", previous).includes("Fixed: do not report it"));

// The gate against repeating an earlier claim: the quoted line must be in the current file.
const current = { a: "const safe = 1;\n" };
const gated = mergeFindings(previous.slice(0, 2), {
  findings: [
    { file: "a", line: 1, severity: "major", message: "one, repeated from memory", evidence: "const unsafe = 1;", previous_id: "F1" },
    { file: "a", line: 1, severity: "major", message: "two, quoted", evidence: "const safe = 1;", previous_id: "F2" },
    { file: "a", line: 1, severity: "minor", message: "new, invented", evidence: "no such line", previous_id: null },
  ],
  resolved_ids: [],
}, { readFile: (file) => current[file] ?? null });
check("gate: an earlier finding quoting a line that is gone counts as resolved", gated.resolved.includes("F1") && gated.disproved.includes("F1") && !gated.open.some((finding) => finding.id === "F1"));
check("gate: an earlier finding quoting a real line stays open", gated.stillOpen.includes("F2") && gated.open.some((finding) => finding.id === "F2"));
check("gate: a new finding quoting nothing real is dropped and counted", gated.toPost.length === 0 && gated.unsupported.length === 1);

// --- The other blueprint files -------------------------------------------------------------------------------

const BLUEPRINT = join(repoRoot, "blueprints", "ci-review");
const section = createLabWorkspace("section");
writeWorkspaceFile(section.work, "CLAUDE.md", readFileSync(join(BLUEPRINT, "claude-md-ci-section.md"), "utf8"));
const sectionRun = await runStubbed(section, "hello");
check("blueprint CI section: loads under -p", requestText(sectionRun.requests[0]).includes(CI_SECTION_MARK));
check("blueprint CI section: its usage comment is not sent", !requestText(sectionRun.requests[0]).includes("Paste into your project"));

// The workflow never ran. These checks only confirm it is marked, and that it asks the script for options that exist.
const workflow = readFileSync(join(BLUEPRINT, ".github", "workflows", "claude-review.yml"), "utf8");
const scriptSource = readFileSync(PIPELINE, "utf8");
check("workflow: it is marked as unexecuted", workflow.startsWith("# UNEXECUTED EXAMPLE."));
const workflowOptions = [...workflow.matchAll(/^\s+--([a-z-]+)/gm)].map((match) => match[1]);
check("workflow: every script option it passes exists in the script", workflowOptions.length >= 5 && workflowOptions.every((name) => scriptSource.includes(`"${name}"`) || scriptSource.includes(`"--${name}"`)), workflowOptions.join(","));
check("workflow: secrets come from the secret store", /secrets\.ANTHROPIC_API_KEY/.test(workflow) && !/sk-ant/.test(workflow));

check("no captured request holds private content", ![pipeline, good, printed, sectionRun].some((run) => hasPrivateContent(JSON.stringify(run.requests))));
finishChecks();
