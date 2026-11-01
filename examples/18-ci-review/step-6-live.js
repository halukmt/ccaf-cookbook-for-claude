// PAID, small: incremental review across two pushes, with a non-incremental second review as control. Haiku, capped.
// Push 1 holds three problems. Push 2 fixes the SQL injection, leaves the secret and the bad delete, and adds a new one.

import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { installGhTrap, newRepo, parseDryRun, push, runPipelineGuarded } from "./ci-lab.js";

const TOPICS = {
  sqlInjection: /injection[^.]*email|email[^.]*(concatenat|injection)/i,
  secret: /secret|sk_live|credential|hard-?coded|api[_ ]key/i,
  deleteAll: /delet/i,
};
const topicsOf = (finding) => Object.entries(TOPICS).filter(([, pattern]) => pattern.test(finding.message)).map(([name]) => name);
const about = (findings, topic) => findings.filter((finding) => topicsOf(finding).includes(topic));
const show = (findings) => findings.map((finding) => `  ${finding.id} [${finding.severity}] ${finding.file}:${finding.line} ${finding.message.slice(0, 140)}`).join("\n");

const repo = newRepo("incremental");
const store = join(repo.root, "findings.json");
const trap = installGhTrap(repo);
const review = (workspace, path, commit) => runPipelineGuarded(workspace, ["review", "--base", "main", "--store", path, "--repo", "acme/orders", "--pr", "42", "--commit", commit, "--model", FAST_MODEL, "--budget", "0.4"], { extraPath: trap.dir });

const commit1 = push(repo, 1);
const first = await review(repo, store, commit1);
const afterFirst = JSON.parse(readFileSync(store, "utf8"));
const firstPosted = parseDryRun(first.stdout);
console.log(`Run 1 ($${first.summary?.costUsd?.toFixed(4)}): ${afterFirst.length} findings, ${firstPosted.length} comments printed\n${show(afterFirst)}\n${first.stderr.slice(0, 300)}`);

const commit2 = push(repo, 2);
const second = await review(repo, store, commit2);
const afterSecond = JSON.parse(readFileSync(store, "utf8"));
const secondPosted = parseDryRun(second.stdout);
console.log(`\nRun 2, incremental ($${second.summary?.costUsd?.toFixed(4)}): ${JSON.stringify(second.summary)}\nStill open:\n${show(afterSecond)}\nComments printed: ${secondPosted.length}\n${secondPosted.map((call) => `  ${call.payload.body.split("\n")[0]}`).join("\n")}\n${second.stderr.slice(0, 300)}`);

// Control: the same second push with no stored findings.
const control = newRepo("full-rerun");
const controlStore = join(control.root, "findings.json");
push(control, 1);
const controlCommit = push(control, 2);
const fresh = await review(control, controlStore, controlCommit);
const freshPosted = parseDryRun(fresh.stdout);
const freshFindings = JSON.parse(readFileSync(controlStore, "utf8"));
console.log(`\nControl, no stored findings ($${fresh.summary?.costUsd?.toFixed(4)}): ${freshPosted.length} comments printed\n${show(freshFindings)}\n`);

const costs = [first, second, fresh].reduce((sum, run) => sum + (run.summary?.costUsd ?? 0), 0);
console.log(`Total cost: $${costs.toFixed(4)}`);

const firstSql = about(afterFirst, "sqlInjection");
const firstSecret = about(afterFirst, "secret");
const firstDelete = about(afterFirst, "deleteAll");
check("all three reviews finished", first.code === 0 && second.code === 0 && fresh.code === 0);
check("run 1 found the three seeded problems", firstSql.length > 0 && firstSecret.length > 0 && firstDelete.length > 0);
check("run 1 printed a comment per finding, and stored them", firstPosted.length === afterFirst.length && afterFirst.length >= 3);
check("run 2: the fixed SQL injection was reported as resolved", firstSql.every((finding) => second.summary.resolved.includes(finding.id)), second.summary.resolved.join(","));
check("run 2: the fixed one is gone from the store", !afterSecond.some((finding) => firstSql.some((earlier) => earlier.id === finding.id)));
console.log(`Run 2 detail: resolved ${second.summary.resolved}, of which the code's own gate disproved ${second.summary.disproved}, unsupported new findings dropped ${second.summary.unsupported}`);
check("run 2: the secret stayed open with its original id", firstSecret.some((finding) => afterSecond.some((open) => open.id === finding.id)));
check("run 2: the bad delete stayed open with its original id", firstDelete.some((finding) => afterSecond.some((open) => open.id === finding.id)));
// runReport is on line 10 of the second push. A message may call it "the table name", so the line is the reliable test.
check("run 2: the new problem was found, on its own line, as new", afterSecond.some((finding) => second.summary.new.includes(finding.id) && finding.line === 10));
check("run 2: no repeated comment: only new findings were printed", secondPosted.length === second.summary.new.length && !secondPosted.some((call) => TOPICS.secret.test(call.payload.body)));
const repeats = freshPosted.filter((call) => TOPICS.secret.test(call.payload.body) || TOPICS.deleteAll.test(call.payload.body)).length;
check("control: with no stored findings, old problems are posted again", repeats >= 2, `${repeats} repeated comments`);
check("fewer comments on push 2 with stored findings than without", secondPosted.length < freshPosted.length, `${secondPosted.length} vs ${freshPosted.length}`);
check("the dry run never called gh", !existsSync(trap.log));
check("the guard refused nothing and no request held private content", [first, second, fresh].every((run) => run.blocked === 0 && !hasPrivateContent(JSON.stringify(run.requests))));
finishChecks();
