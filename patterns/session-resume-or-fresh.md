# Session resume or fresh start

Decide how to continue earlier agent work: resume the session, fork it, or start fresh with an injected summary of its conclusions.

## Use when

- Agent work spans a break and the files may have changed in between
- A pipeline needs to carry knowledge from one agent run to the next
- You want to try two follow-ups from the same point

## Do not use when

- The work is one continuous run; there is nothing to carry over
- The follow-up needs only a small, self-contained fact; pass that fact directly

## Decision

Nothing changed: resume. Files changed: start fresh, inject a summary of conclusions, name the changed files, and ask for those to be re-read and for the summary's claims to be verified. Comparing two approaches from one
point: fork. If you must resume after a change, say what changed and that the earlier findings were correct at the time. In scripts, store the session ID, since print mode in the tested version refuses names. Generate summaries
with a forced tool call and stop the run if the result is empty, or the next session works from nothing while still looking fine.

## Trap

The failure is not only stale advice. A resumed session was never told the files changed, so on re-reading it decided its correct findings had been its own errors, and then it distrusted its findings on unchanged files too. Separately, a summary
carries errors along with its conclusions: the fresh session reported lines as newly changed when they were not. And for isolation, a temporary config directory is not enough when the working directory sits under the user's home, since the
CLI found the user's global instructions by walking up from it.

## Example

[session-lab.js](../examples/07-session-resumption/session-lab.js): driving the CLI, isolation settings, reading the real request.
[pipeline.js](../examples/07-session-resumption/pipeline.js): the sequence and the fresh prompt.
[notes.md](../examples/07-session-resumption/notes.md): the answers, in detail.

## Verified

2026-10-31, `claude` CLI 2.1.77, `claude-sonnet-5-5` with thinking disabled, one run of each. After 3 of 12 files were fixed, two forked resumes re-read what they were asked about and recognised the fix, but both called their earlier correct findings wrong. The first
request after resume held 2 of the 13 tool results stored in the transcript and no notice of change. The fresh session named the fixes correctly at about the same cost ($0.10 vs $0.07 to $0.09), but carried two errors over from its summary.

## Usual advice vs observed

The usual account has old tool results staying in the history, and the agent recommending fixes already applied. Here the model re-read the files and recommended no applied fixes, and most old tool results were not re-sent at all. The fresh-start advice still holds, for a different reason: what matters most is telling the model that the
files changed. The lost tool results may be specific to this older CLI version, and a newer one was not tested.
