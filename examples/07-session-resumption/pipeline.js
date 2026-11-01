// All live steps as one sequence, since each session depends on the last. Calls run one at a time.
// A forked resume and a plain resume both start from the same history, so they can be compared.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadCodebase } from "../../_fixtures/codebase-answers.js";
import { applyFixes, assessAnswer, CHANGED_FILES, createWorkspace, runClaude, storedToolResults } from "./session-lab.js";
import { buildSummary } from "./summary.js";

export const SESSION_NAME = "code-review-session";

const ANALYSE =
  "Go through every file in ./src and find bugs, security issues and code-quality problems. " +
  "Read every file. List findings per file.";
// This wording asks for the current state, which invites a re-read.
const RESUME_ASKS_STATE =
  "What state is auth.js in now? Does it still have security problems to fix?";
// Neutral wording: it does not hint that anything changed.
const RESUME_NEUTRAL = "Give me your prioritised fix list for auth.js, database.js and api-routes.js.";

export const freshPrompt = (summary) =>
  `Previous analysis summary:\n${summary}\n\n` +
  `These 3 files changed since that analysis: ${CHANGED_FILES.map((f) => `src/${f}`).join(", ")}.\n\n` +
  "Re-analyse ONLY these 3 files: verify the fixes and look for newly introduced issues. " +
  "Earlier conclusions about every other file still stand. Then report where each of the 3 files stands now.";

const newestChange = (dir) => {
  try {
    return readdirSync(dir).reduce((latest, name) => Math.max(latest, statSync(join(dir, name)).mtimeMs), 0);
  } catch {
    return 0;
  }
};

// Read-only look at the real config directory, to prove it was not written to.
const realConfigStamp = () => ({
  projects: newestChange(join(homedir(), ".claude", "projects")),
  root: newestChange(join(homedir(), ".claude")),
});

// Strips what a run does not need to keep. Prompts and answers stay, nothing secret was captured.
export const keep = (run, extra = {}) => ({ ...run, ...extra, assessment: assessAnswer(run.text) });

export async function runSessionLab({ onStage = () => {} } = {}) {
  const stampBefore = realConfigStamp();
  const workspace = createWorkspace();
  const fixtureBefore = [...loadCodebase().values()].join("");
  const out = {};

  onStage("Step 1: named session analyses the codebase");
  out.initial = await runClaude(workspace, ANALYSE, { name: SESSION_NAME });
  const sessionId = out.initial.sessionId;
  if (!sessionId || out.initial.isError) {
    throw new Error(`Initial session failed: ${out.initial.text || out.initial.stderr}`);
  }
  const sessionDir = join(workspace.configDir, "projects");
  out.sessionFileWritten = readdirSync(sessionDir, { recursive: true }).some((f) => String(f).endsWith(`${sessionId}.jsonl`));
  out.toolResultsStored = storedToolResults(workspace.configDir, sessionId);

  onStage("Step 2: structured summary");
  out.summary = await buildSummary(SESSION_NAME, out.initial.text);
  // A fresh session built on an empty summary would prove nothing, so stop before spending more.
  if (out.summary.files.length === 0) throw new Error("The structured summary came back empty.");

  onStage("Resume by name, before any change");
  out.resumeByName = await runClaude(workspace, "Reply with the single word READY.", { resume: SESSION_NAME, fork: true, capture: false });

  onStage("Step 3: fix three files in the temporary copy");
  const before = CHANGED_FILES.map((f) => readFileSync(join(workspace.src, f), "utf8"));
  applyFixes(workspace.src);
  out.fixed = {
    files: CHANGED_FILES,
    changed: CHANGED_FILES.map((f, i) => readFileSync(join(workspace.src, f), "utf8") !== before[i]),
    authHasParameter: readFileSync(join(workspace.src, "auth.js"), "utf8").includes("WHERE email = $1"),
    fixtureUntouched: fixtureBefore === [...loadCodebase().values()].join(""),
  };

  onStage("Step 4a: forked resume, neutral question");
  out.resumeNeutral = keep(await runClaude(workspace, RESUME_NEUTRAL, { resume: sessionId, fork: true }), { prompt: RESUME_NEUTRAL });

  onStage("Step 4b: resume, asking for the current state");
  out.resumeState = keep(await runClaude(workspace, RESUME_ASKS_STATE, { resume: sessionId, fork: true }), { prompt: RESUME_ASKS_STATE });

  onStage("Step 5: fresh session with the summary injected");
  const prompt = freshPrompt(out.summary.markdown);
  out.fresh = keep(await runClaude(workspace, prompt), { prompt });

  const stampAfter = realConfigStamp();
  out.isolation = {
    realProjectsUntouched: stampBefore.projects === stampAfter.projects,
    realConfigRootUntouched: stampBefore.root === stampAfter.root,
    leakedUserInstructions: [out.initial, out.resumeNeutral, out.resumeState, out.fresh].some((r) => r.wire?.leakedUserInstructions),
  };
  out.originalSessionId = sessionId;
  out.finishedAt = new Date().toISOString();
  return out;
}

export function totalCost(lab) {
  return [lab.initial, lab.resumeByName, lab.resumeNeutral, lab.resumeState, lab.fresh].reduce((sum, run) => sum + run.costUsd, 0);
}
