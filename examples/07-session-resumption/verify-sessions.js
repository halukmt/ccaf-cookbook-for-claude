// The checks on a finished run, usable right after it or later on the saved file. They test the facts
// of the run. Whether stale advice appeared is a measurement for the comparison and is not assumed here.

import { CHANGED_FILES } from "./session-lab.js";
import { loadCodebase } from "../../_fixtures/codebase-answers.js";

export function sessionChecks(lab) {
  const codebase = loadCodebase();
  const fileNames = [...codebase.keys()];
  const sourceLines = [...codebase.values()].flatMap((text) => text.split("\n")).filter((l) => l.trim().length > 40);
  const neutral = lab.resumeNeutral;
  const issueCount = lab.summary.files.flatMap((entry) => entry.issues).length;

  return [
    ["Step 1: the session ran and answered", !lab.initial.isError && lab.initial.text.length > 500, `${lab.initial.text.length} chars`],
    ["Step 1: it read every file", fileNames.every((f) => lab.initial.filesRead.includes(f)), `${lab.initial.filesRead.length} of ${fileNames.length}`],
    ["Step 1: findings name every file", fileNames.every((f) => lab.initial.text.includes(f.replace(".js", "")))],
    ["Step 1: the session was stored in the temporary config directory", lab.sessionFileWritten],
    ["Step 1: resume by name is refused in print mode, by design of this CLI version", lab.resumeByName.exitCode !== 0 && lab.resumeByName.stdoutTail.includes("requires a valid session ID")],

    ["Step 2: the summary covers every file", fileNames.every((f) => lab.summary.files.some((e) => e.file.endsWith(f))), `${lab.summary.files.length} entries`],
    ["Step 2: the summary has findings", issueCount >= 10, `${issueCount} issues`],
    ["Step 2: the summary holds no raw source lines", !sourceLines.some((l) => lab.summary.markdown.includes(l.trim()))],

    ["Step 3: three files really changed", lab.fixed.changed.length === 3 && lab.fixed.changed.every(Boolean)],
    ["Step 3: the SQL fix is in the file", lab.fixed.authHasParameter],
    ["Step 3: the fixture itself is untouched", lab.fixed.fixtureUntouched],

    ["Step 4: both resumes answered", !neutral.isError && !lab.resumeState.isError && Boolean(neutral.text && lab.resumeState.text)],
    ["Step 4: the forks got their own session IDs", neutral.sessionId !== lab.originalSessionId && lab.resumeState.sessionId !== lab.originalSessionId],
    ["Step 4: history was really re-sent on resume", neutral.wire?.messages > 1, `${neutral.wire?.messages} messages`],
    ["Step 4: the transcript stored more tool results than resume re-sent", lab.toolResultsStored > neutral.wire?.toolResults, `${lab.toolResultsStored} stored, ${neutral.wire?.toolResults} sent, files: ${neutral.wire?.filesInToolResults}`],

    ["Step 5: the fresh session answered", !lab.fresh.isError && lab.fresh.text.length > 200],
    ["Step 5: it is a new session", lab.fresh.sessionId !== lab.originalSessionId],
    ["Step 5: the summary with real findings was in the prompt", lab.fresh.prompt.includes(lab.summary.files[0]?.issues?.[0]?.description ?? "MISSING") && issueCount >= 10],
    ["Step 5: it started with no old tool results", lab.fresh.wire?.toolResults === 0],
    ["Step 5: it read all three changed files", CHANGED_FILES.every((f) => lab.fresh.filesRead.includes(f)), lab.fresh.filesRead.join(", ")],

    ["Isolation: the real ~/.claude/projects was not written to", lab.isolation.realProjectsUntouched],
    ["Isolation: the user's global instructions did not reach the model", !lab.isolation.leakedUserInstructions],
  ];
}
