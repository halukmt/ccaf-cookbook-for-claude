// PAID, small. Step 4: does the CI section of CLAUDE.md change generated tests? Step 5: independent review against
// self-review in the generating session. Haiku, each call capped. Judged by the files and the real test runner.

import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL, repoRoot } from "../../_shared/client.js";
import { requestText, runGuarded } from "../../_shared/config-lab.js";
import { git, newRepo, removeProjectInstructions, runPipelineGuarded } from "./ci-lab.js";

const SCHEMA = JSON.parse(readFileSync(join(repoRoot, "blueprints", "ci-review", "schemas", "findings.schema.json"), "utf8"));
const GENERATE = ["generate", "--target", "src/auth/middleware.js", "--out", "test/middleware.test.js", "--model", FAST_MODEL, "--budget", "0.4"];
const OUT = "test/middleware.test.js";

function nodeTests(dir) {
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", OUT], { cwd: dir, encoding: "utf8" });
  return { pass: Number(run.stdout.match(/# pass (\d+)/)?.[1] ?? 0), fail: Number(run.stdout.match(/# fail (\d+)/)?.[1] ?? 0) };
}
const usesFactories = (text) => /factories/.test(text) && /buildUser/.test(text);
const sentenceNames = (text) => (text.match(/["'`]should .+ when /g) ?? []).length;

// --- Step 4 ----------------------------------------------------------------------------------------

const documented = newRepo("documented");
const withSection = await runPipelineGuarded(documented, GENERATE);
const bare = newRepo("bare");
removeProjectInstructions(bare);
const withoutSection = await runPipelineGuarded(bare, GENERATE);

const documentedText = existsSync(join(documented.work, OUT)) ? readFileSync(join(documented.work, OUT), "utf8") : "";
const bareText = existsSync(join(bare.work, OUT)) ? readFileSync(join(bare.work, OUT), "utf8") : "";
console.log(`With CI section: $${withSection.summary?.costUsd?.toFixed(4)}, factories ${usesFactories(documentedText)}, "should ... when" names ${sentenceNames(documentedText)}, tests ${JSON.stringify(nodeTests(documented.work))}`);
console.log(`Without: $${withoutSection.summary?.costUsd?.toFixed(4)}, factories ${usesFactories(bareText)}, "should ... when" names ${sentenceNames(bareText)}, tests ${JSON.stringify(nodeTests(bare.work))}`);

check("step 4: both generation runs finished", withSection.code === 0 && withoutSection.code === 0, `${withSection.stderr}${withoutSection.stderr}`.slice(0, 300));
check("step 4: with the section, the file uses the documented factories", usesFactories(documentedText));
check("step 4: with the section, the tests use the documented naming", sentenceNames(documentedText) >= 3, `${sentenceNames(documentedText)} names`);
check("step 4: with the section, the generated tests really pass", nodeTests(documented.work).fail === 0 && nodeTests(documented.work).pass >= 3);
check("step 4: without it, the naming convention does not appear", sentenceNames(bareText) < sentenceNames(documentedText));

// --- Step 5 ----------------------------------------------------------------------------------------

git(documented.work, "add", "-A");
git(documented.work, "commit", "-q", "-m", "generated tests");
const generationPrompt = withSection.requests.map((request) => requestText(request)).join("\n");

const independent = await runPipelineGuarded(documented, ["review", "--base", "main", "--store", join(documented.root, "independent.json"), "--repo", "acme/orders", "--pr", "42", "--model", FAST_MODEL, "--budget", "0.4"]);
const independentFindings = JSON.parse(readFileSync(join(documented.root, "independent.json"), "utf8"));

// The fair comparison: the same focused prompt, in the generating session and in a fresh one.
const FOCUSED = `Review the test file at ${OUT} for missing coverage, unhandled edge cases and weak assertions, using the review criteria. Do not assume the tests are correct. For evidence, copy the offending line. Set previous_id to null and resolved_ids to an empty list.`;
const REVIEW_OPTIONS = { outputFormat: "json", tools: "Read,Grep,Glob", allowedTools: "Read,Grep,Glob", budgetUsd: 0.4, preflight: false };
const schemaArgs = ["--json-schema", JSON.stringify(SCHEMA)];
const selfReview = await runGuarded(documented, FOCUSED, { ...REVIEW_OPTIONS, extraArgs: ["--resume", withSection.summary.sessionId, ...schemaArgs] });
const freshReview = await runGuarded(documented, FOCUSED, { ...REVIEW_OPTIONS, extraArgs: schemaArgs });
const selfFindings = selfReview.result?.structured_output?.findings ?? [];
const freshFindings = freshReview.result?.structured_output?.findings ?? [];

const show = (list) => list.map((finding) => `  [${finding.severity}] ${finding.file}:${finding.line} ${finding.message}`).join("\n");
console.log(`\nPipeline review of the whole diff ($${independent.summary?.costUsd?.toFixed(4)}): ${independentFindings.length} findings\n${show(independentFindings)}`);
console.log(`\nFresh session, focused prompt ($${freshReview.costUsd.toFixed(4)}): ${freshFindings.length} findings\n${show(freshFindings)}`);
console.log(`\nGenerating session, same focused prompt ($${selfReview.costUsd.toFixed(4)}): ${selfFindings.length} findings\n${show(selfFindings)}\n`);

const independentText = independent.requests.map((request) => requestText(request)).join("\n");
const liveRuns = [withSection, withoutSection, independent, selfReview, freshReview];
check("step 5: two different session ids, and the review did not resume", independent.summary?.sessionId !== withSection.summary?.sessionId);
check("step 5: the review's requests hold no generation prompt", generationPrompt.includes("Generate unit tests for") && !independentText.includes("Generate unit tests for"));
check("step 5: the review's requests hold no reasoning from generation", !independent.requests.some((request) => request.messages.some((message) => message.role === "assistant" && JSON.stringify(message.content).includes(OUT) && JSON.stringify(message.content).includes('"name":"Write"'))));
check("step 5: the self-review did see the generating session", selfReview.requests.some((request) => requestText(request).includes("Generate unit tests for")));
check("step 5: the fresh review did not", !freshReview.requests.some((request) => requestText(request).includes("Generate unit tests for")));
check("step 5: all three reviews returned structured findings", independent.code === 0 && Boolean(selfReview.result?.structured_output) && Boolean(freshReview.result?.structured_output));

const total = [withSection.summary?.costUsd, withoutSection.summary?.costUsd, independent.summary?.costUsd, selfReview.costUsd, freshReview.costUsd].reduce((sum, cost) => sum + (cost ?? 0), 0);
console.log(`Total cost: $${total.toFixed(4)}`);
check("the guard refused nothing and no request held private content", liveRuns.every((run) => (run.blocked ?? 0) === 0) && !liveRuns.some((run) => hasPrivateContent(JSON.stringify(run.requests))));
finishChecks();
