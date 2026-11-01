// Builds the resume versus fresh table from a finished run. Pure function, no model.

const yes = (value) => (value ? "yes" : "no");
const reads = (run) => `${run.filesRead.length}: ${run.filesRead.join(", ") || "none"}`;

export function buildComparison(lab) {
  const neutral = lab.resumeNeutral;
  const state = lab.resumeState;
  const fresh = lab.fresh;
  const row = (metric, pick) => ({ metric, "resume, neutral": pick(neutral), "resume, state question": pick(state), "fresh + summary": pick(fresh) });
  const stale = (run) => run.assessment.sqlStaleSentences.length + run.assessment.leakStaleSentences.length;

  const table = [
    row("Files read in this run", reads),
    row("Told that files changed?", (run) => yes(run.wire?.changeNotice)),
    row("Tool results in the first request", (run) => run.wire?.toolResults ?? 0),
    row("Old auth.js contents in those results", (run) => yes(run.wire?.filesInToolResults?.includes("auth.js"))),
    row("Says SQL fix is in place", (run) => yes(run.assessment.saysSqlFixed)),
    row("Sentences treating a fixed issue as open", stale),
    row("Disowns earlier correct findings", (run) => yes(run.assessment.disownsEarlierFindings)),
    row("Denies that the file changed", (run) => yes(run.assessment.deniesChange)),
    row("Flags remaining MD5 problem", (run) => yes(run.assessment.flagsMd5)),
    row("Cost, as reported by the CLI", (run) => `$${run.costUsd.toFixed(3)}`),
    row("Seconds", (run) => run.durationSeconds),
  ];

  const predictions = [
    ["Resume recommends fixes already applied", stale(neutral) + stale(state) > 0],
    ["Resume refers to old code it did not re-read", neutral.filesRead.length === 0 || state.filesRead.length === 0],
    ["Resume sends all old tool results", neutral.wire?.toolResults >= lab.toolResultsStored],
    ["Resume produces inconsistent statements about the changed files", neutral.assessment.disownsEarlierFindings || state.assessment.disownsEarlierFindings],
    ["Resume analyses all files again", neutral.filesRead.length >= 12 || state.filesRead.length >= 12],
    ["Fresh session recognises the fix", fresh.assessment.saysSqlFixed],
    ["Fresh session reads only the 3 changed files", fresh.filesRead.length === 3],
  ];

  return { table, predictions };
}
