// Free: what plan mode really enforces under -p, with a scripted model that tries to break it. If these results
// came from a real model, a well-behaved one would hide them by never trying.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toolResultsSent } from "../../_shared/api-capture.js";
import { check, finishChecks } from "../../_shared/check.js";
import { blockText, requestText, runStubbed, toolUse } from "../../_shared/config-lab.js";
import { API_MARKERS, hashTree, newWorkspace, runProjectTests } from "./plan-lab.js";

const resultOf = (run, toolName, nth = 0) => toolResultsSent(run.requests).filter((result) => result.toolName === toolName)[nth];

// --- The sandbox itself -----------------------------------------------------------------------------

const baseline = newWorkspace("baseline");
const startTests = runProjectTests(baseline.work);
check("sandbox: the anonymous-visitor bug really fails, and only that", startTests.fail === 1 && startTests.failed.some((name) => /anonymous/.test(name)), startTests.failed.join("; "));
check("sandbox: the date behaviour tests pass on the old library", startTests.pass === 5);

// --- Plan mode against a model that tries everything ---------------------------------------------------

const workspace = newWorkspace("plan");
const before = hashTree(workspace.work);
const attempts = [
  () => toolUse("Read", { file_path: join(workspace.work, "src/utils/format.js") }),
  () => toolUse("Edit", { file_path: join(workspace.work, "src/utils/format.js"), old_string: "user.name", new_string: "user?.name" }),
  () => toolUse("Write", { file_path: join(workspace.work, "written.txt"), content: "x" }),
  () => toolUse("Bash", { command: "echo x > redirected.txt" }),
  () => toolUse("Bash", { command: "mkdir made-by-bash" }),
  () => toolUse("ExitPlanMode", { plan: "The plan." }),
  () => toolUse("Write", { file_path: join(workspace.work, "after-exit.txt"), content: "x" }),
];
const planRun = await runStubbed(workspace, "Plan this.", {
  permissionMode: "plan",
  script: (_, index) => (index < attempts.length ? [attempts[index]()] : "done"),
});
const planText = requestText(planRun.requests[0]);
check("plan mode: the model is told about it in the first request", /Plan mode is active/.test(planText));
check("plan mode: init reports it", planRun.init.permissionMode === "plan");
check("plan mode: Write and Edit stay offered in the request, so the limit is at execution", planRun.requests[0].tools.some((tool) => tool.name === "Write"));
check("plan mode: Read runs", resultOf(planRun, "Read").isError === false);
check("plan mode: Edit is refused", resultOf(planRun, "Edit").isError === true);
check("plan mode: Write is refused", resultOf(planRun, "Write").isError === true);
check("plan mode: Bash redirection is refused", resultOf(planRun, "Bash", 0).isError === true);
check("plan mode: a mutating Bash command is refused", resultOf(planRun, "Bash", 1).isError === true && !existsSync(join(workspace.work, "made-by-bash")));
check("under -p, ExitPlanMode fails: no one is there to approve", resultOf(planRun, "ExitPlanMode").isError === true, resultOf(planRun, "ExitPlanMode").text.split("\n")[0]);
check("after that, the mode is still plan: a later Write is refused", resultOf(planRun, "Write", 1).isError === true && !existsSync(join(workspace.work, "after-exit.txt")));
check("plan mode: the source tree is byte-identical", hashTree(workspace.work) === before);

// The plan file is the one exception.
const planPath = /([A-Z]:\\[^\s"]*[\\/]plans[\\/][^\s".]+\.md)/.exec(planText)?.[1];
check("the reminder names a plan file in the config directory", planPath?.startsWith(workspace.configDir), planPath ?? "not found");
const planWrite = newWorkspace("plan-file");
let planFile;
const planWriteRun = await runStubbed(planWrite, "Plan this.", {
  permissionMode: "plan",
  script: (request, index) => {
    planFile ??= /([A-Z]:\\[^\s"]*[\\/]plans[\\/][^\s".]+\.md)/.exec(requestText(request))?.[1];
    return index === 0 ? [toolUse("Write", { file_path: planFile, content: "The plan.\n" })] : "done";
  },
});
check("the plan file itself can be written in plan mode", resultOf(planWriteRun, "Write")?.isError === false && readdirSync(join(planWrite.configDir, "plans")).length === 1);

// --- An allow rule and plan mode --------------------------------------------

const allowed = newWorkspace("plan-allowed");
const allowedRun = await runStubbed(allowed, "Plan this.", {
  permissionMode: "plan",
  allowedTools: "Write,Bash(mkdir:*)",
  script: (_, index) => {
    if (index === 0) return [toolUse("Write", { file_path: join(allowed.work, "allowed-write.txt"), content: "x" })];
    if (index === 1) return [toolUse("Bash", { command: "mkdir allowed-bash" })];
    return "done";
  },
});
const allowedWrite = existsSync(join(allowed.work, "allowed-write.txt"));
const allowedBash = existsSync(join(allowed.work, "allowed-bash"));
check("trap: an explicit --allowedTools Write rule punches through plan mode", allowedWrite);
check("Bash(mkdir:*) under the same flag was still refused", !allowedBash);

// --- Hybrid mechanics: a resumed session can change mode ----------------------------------------------

const hybrid = newWorkspace("hybrid");
const phase1 = await runStubbed(hybrid, "Plan this.", { permissionMode: "plan", script: () => "The plan: PLAN-MARK-1." });
const phase2 = await runStubbed(hybrid, "Now execute.", {
  permissionMode: "acceptEdits",
  allowedTools: "Read,Edit,Write",
  extraArgs: ["--resume", phase1.sessionId],
  script: (_, index) => (index === 0 ? [toolUse("Write", { file_path: join(hybrid.work, "phase2.txt"), content: "x" })] : "done"),
});
check("hybrid: a --resume in another mode writes", existsSync(join(hybrid.work, "phase2.txt")));
check("hybrid: the resumed request carries the plan from the first phase", requestText(phase2.requests[0]).includes("PLAN-MARK-1"));

// --- The Explore subagent, scripted ---------------------------------------------------------------------

const explore = newWorkspace("explore");
const isSubagent = (request) => !blockText(request.system).includes("interactive agent");
let subagentSteps = 0;
const exploreRun = await runStubbed(explore, "Use the Explore subagent to map src/api.", {
  allowedTools: "Agent,Read,Grep,Glob",
  script: (request) => {
    if (isSubagent(request)) {
      const step = subagentSteps++;
      return step === 0 ? [toolUse("Read", { file_path: join(explore.work, "src/api/users.js") })] : "EXPLORE-SUMMARY-MARK";
    }
    return requestText(request).includes("EXPLORE-SUMMARY-MARK") ? "main done" : [toolUse("Agent", { subagent_type: "Explore", description: "Map the API", prompt: "Map src/api." })];
  },
});
const mainRequests = exploreRun.requests.filter((request) => !isSubagent(request));
const subRequests = exploreRun.requests.filter(isSubagent);
const explorerTools = subRequests[0].tools.map((tool) => tool.name);
check("Explore: a separate agent ran, read-oriented, without Write or Edit", !explorerTools.includes("Write") && !explorerTools.includes("Edit"), explorerTools.slice(0, 5).join(","));
check("Explore: the subagent saw the file", subRequests.some((request) => requestText(request).includes(API_MARKERS[0])));
check("Explore: the main conversation never saw the file", !mainRequests.some((request) => requestText(request).includes(API_MARKERS[0])));
check("Explore: the main conversation got the summary as a tool result", requestText(mainRequests.at(-1)).includes("EXPLORE-SUMMARY-MARK"));

check("no captured request holds private content", ![planRun, planWriteRun, allowedRun, phase2, exploreRun].some((run) => run.privateSeen));
finishChecks();
