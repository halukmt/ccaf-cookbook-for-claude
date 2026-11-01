// Step 4: a real process, a simulated crash in the third task, then a real resume in a new process. The crash is forced;
// nothing else about the run is. Paid once on Haiku and saved. Runs the two processes one after the other.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { INVESTIGATIONS, TRUTH } from "./tasks.js";
import { createWorkspace } from "./workspace.js";

const store = resultStore(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const CRASH_DURING = "external-apis";

const run = await store.runOnce("crash-resume", async () => {
  const { root } = createWorkspace();
  const session = (...args) => {
    const child = spawnSync(process.execPath, [join(here, "session-run.js"), root, ...args], { encoding: "utf8", timeout: 300000 });
    return { status: child.status, stderr: child.stderr.slice(-800) };
  };
  const manifestPath = join(root, "exploration-manifest.json");
  const readManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));

  const first = session(CRASH_DURING);
  const afterCrash = readManifest();
  const leftoverTemp = existsSync(`${manifestPath}.tmp`);
  const second = session();
  const final = readManifest();
  const log = readFileSync(join(root, "session-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  return { model: FAST_MODEL, first, second, afterCrash, final, leftoverTemp, log };
});

console.log(`First process exit: ${run.first.status}. Second process exit: ${run.second.status}.`);
console.log("Manifest after the crash:", JSON.stringify({ sessionId: run.afterCrash.sessionId, phase: run.afterCrash.phase, exploredPaths: run.afterCrash.exploredPaths, nextSteps: run.afterCrash.nextSteps, findings: run.afterCrash.keyFindings.map((f) => f.task), lastUpdated: run.afterCrash.lastUpdated }, null, 1));
for (const entry of run.log) console.log(`  pid ${entry.pid}: ${entry.event}${entry.task ? ` ${entry.task}` : ""}${entry.event === "task_start" ? `, ${entry.priorFindingCount} prior findings injected` : ""}`);
console.log("Final manifest findings:", run.final.keyFindings.map((f) => f.task).join(", "));
console.log(`Computed cost of completed tasks ${usd(estimateCost(run.model, run.final.usage))}. The crashed task's call is not included, as the process died before recording it.`);

const pids = [...new Set(run.log.map((e) => e.pid))];
const started = (pid) => run.log.filter((e) => e.pid === pid && e.event === "task_start").map((e) => e.task);
const done = (pid) => run.log.filter((e) => e.pid === pid && e.event === "task_done").map((e) => e.task);
const finalTasks = run.final.keyFindings.map((f) => f.task);

check("The first process really died with the crash code", run.first.status === 137);
check("The second process finished cleanly", run.second.status === 0, run.second.stderr);
check("Two different processes did the work", pids.length === 2);
check("The crash left a readable manifest and no half-written file", run.afterCrash.keyFindings.length === 2 && !run.leftoverTemp);
check("The manifest named exactly what was left", run.afterCrash.nextSteps.join() === `${CRASH_DURING},order-flow`);
check("The first process finished two tasks and died in the third", done(pids[0]).length === 2 && started(pids[0]).at(-1) === CRASH_DURING);
check("The resumed process did not repeat finished tasks", started(pids[1]).join() === `${CRASH_DURING},order-flow`);
check("The resume logged what it loaded", run.log.some((e) => e.pid === pids[1] && e.event === "resumed" && e.explored > 0 && e.next.length === 2));
check("Recovered findings went into the resumed prompts", run.log.filter((e) => e.pid === pids[1] && e.event === "task_start").every((e) => e.contextHasPriorFindings && e.priorFindingCount >= 2));
check("The session ID is the same after the resume", run.final.sessionId === run.afterCrash.sessionId && run.final.resumes === 1);
check("All four tasks ended with findings, each once", finalTasks.length === 4 && new Set(finalTasks).size === 4 && INVESTIGATIONS.every((t) => finalTasks.includes(t.subagent)));
check("Nothing is left to do", run.final.nextSteps.length === 0 && run.final.phase === "phase1-complete");
for (const finding of run.final.keyFindings) {
  const truth = TRUTH[finding.task]([finding]);
  check(`After the resume, ${finding.task} agrees with the code`, truth.pass, truth.detail);
}
finishChecks();
