// One exploration session as its own process, so a crash really kills it. Started by step-4-crash.js.
//   node session-run.js <workspace-root> [crash-during-subagent]
// Resumes automatically when the manifest exists. Writes a checkpoint after every report and after every task.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { FAST_MODEL } from "../../_shared/client.js";
import { addUsage } from "../../_shared/pricing.js";
import { delegateToSubagent } from "./explorer.js";
import { INVESTIGATIONS } from "./tasks.js";
import { writeAtomic } from "./workspace.js";

const [root, crashDuring] = process.argv.slice(2);
const code = join(root, "code");
const MANIFEST_PATH = join(root, "exploration-manifest.json");
const LOG_PATH = join(root, "session-log.jsonl");
const log = (entry) => appendFileSync(LOG_PATH, `${JSON.stringify({ pid: process.pid, ...entry })}\n`);

function saveManifest(state) {
  writeAtomic(MANIFEST_PATH, JSON.stringify({ ...state, lastUpdated: new Date().toISOString() }, null, 2));
}

function loadOrCreate() {
  if (!existsSync(MANIFEST_PATH)) {
    return { sessionId: randomUUID(), phase: "phase1", exploredPaths: [], keyFindings: [], nextSteps: INVESTIGATIONS.map((t) => t.subagent), usage: {}, resumes: 0 };
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  log({ event: "resumed", sessionId: manifest.sessionId, phase: manifest.phase, explored: manifest.exploredPaths.length, next: manifest.nextSteps });
  return { ...manifest, resumes: manifest.resumes + 1 };
}

const state = loadOrCreate();
saveManifest(state);
log({ event: "started", sessionId: state.sessionId, nextSteps: state.nextSteps });

for (const name of [...state.nextSteps]) {
  const task = INVESTIGATIONS.find((t) => t.subagent === name);
  const contextBlock = state.keyFindings.length
    ? `## Recovered from the session manifest\nAlready explored: ${state.exploredPaths.join(", ")}\nKey findings: ${JSON.stringify(state.keyFindings)}\nDo not redo this work.\n\n`
    : "";
  log({ event: "task_start", task: name, contextHasPriorFindings: contextBlock.length > 0, priorFindingCount: state.keyFindings.length });

  const result = await delegateToSubagent(task, {
    code,
    model: FAST_MODEL,
    contextBlock,
    // A simulated crash: the process dies mid-task, with no chance to clean up or save.
    onToolCall: (toolName) => {
      if (name === crashDuring && toolName === "read_file") {
        log({ event: "simulated_crash", task: name });
        process.exit(137);
      }
    },
    checkpoint: (findings, filesRead) => {
      state.keyFindings = [...state.keyFindings.filter((f) => f.task !== name), { task: name, ...findings }];
      state.exploredPaths = [...new Set([...state.exploredPaths, ...filesRead])];
      saveManifest(state);
    },
  });

  state.exploredPaths = [...new Set([...state.exploredPaths, ...result.filesRead])];
  state.nextSteps = state.nextSteps.filter((step) => step !== name);
  addUsage(state.usage, result.usage);
  saveManifest(state);
  log({ event: "task_done", task: name, filesRead: result.filesRead, usage: result.usage });
}

state.phase = "phase1-complete";
saveManifest(state);
log({ event: "finished" });
