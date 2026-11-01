# 07 Sessions and resumption: notes

All live runs: 2026-10-31, `claude` CLI 2.1.77 in print mode, `claude-sonnet-5-5`, sequential, in a temporary directory with a temporary
`CLAUDE_CONFIG_DIR`, on a copy of `_fixtures/codebase/`. The summary uses `claude-haiku-5-5`.
Saved run: [results/sessions.json](results/sessions.json).

**The short version: the stale-context problem appeared, but not in the commonly expected form.** The resumed session did not recommend
fixes already applied, because it re-read the files. It concluded instead that its earlier correct findings had been its own errors, and it never
considered that the files had changed. Also, this CLI re-sent only 2 of the 13 stored tool results on resume.

## Costs

About $1.35 in total, more than one run per concept should need, because of three failures described below:
- First full sequence, $0.62, discarded because the isolation check failed.
- Isolation and resume-by-name probe, reported $0.11 for its one captured call plus one more call of unknown cost.
- The saved sequence, $0.40, plus the repeated fresh session, $0.10, plus Haiku summaries, roughly $0.03 each.

## Environment findings

- **A temporary `CLAUDE_CONFIG_DIR` does not fully isolate the CLI.** The first full run came back in German, and a check on the API request failed:
  **the user's global `CLAUDE.md` had been sent to the model.** The system temp directory sits under the user's home, so the CLI's walk up from the
  working directory found `~/.claude/CLAUDE.md` as a project file. It went only to the Anthropic API on the user's own key, and that run's answers are discarded.
  Setting `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` fixed it, and the check passes in the saved run. Example 05 uses `settingSources: []`,
  and its answers were in English. That example's requests were not specifically checked for this.
- Sessions were stored under the temporary directory, and the modification times of `~/.claude` and `~/.claude/projects` did not change. This
  looks only at those two directory levels.
- CLI 2.1.77 sends `thinking.type: "enabled"`, which `claude-sonnet-5-5` rejects with a 400. `MAX_THINKING_TOKENS=0` avoids it. So these runs had no thinking,
  unlike the same model in other examples.
- The CLI's reported cost matches Sonnet list price on its token counts for the first run ($0.17).

## Step 1 — A named session, and names do not work in print mode

Built: `runClaude` around the real CLI, with a proxy capturing the API requests.
Files: [session-lab.js](session-lab.js), [pipeline.js](pipeline.js), [step-1-5-sessions.js](step-1-5-sessions.js)
Executed: yes. 12 of 12 files read, 14 turns, $0.17.
Design choices:
- `-p` print mode is used, since a script cannot drive the interactive session. The tools are limited to Read, Glob and Grep with `dontAsk`.
- **Resume by name cannot be done in print mode.** `--name` is accepted, but `--resume code-review-session` exits 1: "--resume requires a valid session ID when used with
  --print". The script therefore uses the session ID. Resuming by name in the interactive picker is manual, and was not tested. A check records the refusal.
- Files are `.js`, and there are 12, from the shared fixture.

## Step 2 — A generated summary, which inherits the session's mistakes

Built: `buildSummary`, with conclusions per file through a forced tool call, on Haiku.
Files: [summary.js](summary.js), [verify-sessions.js](verify-sessions.js)
Executed: yes. 12 entries, 54 issues, no raw source lines, checked.
Design choice: generated rather than written by hand. Free-form JSON Lines parsed to 1 and then 0 entries in the first two runs, and the checks caught both. The
fresh session of the second run had then told me "the summary had no list of earlier findings". Forced tool use fixed it, and the pipeline now stops if the summary is empty.
Finding: The summary inherits the first session's mistakes. It says `expiresIn` is "set to a number (30)", when the source says `config.sessionTtlMinutes`. See step 5.

## Step 3 — Three real fixes, with one problem left in on purpose

Built: `applyFixes`, with string edits that throw if they miss.
Executed: yes. Parameterised query in `auth.js`, `try/finally` in `database.js`, rate limiter and `requireUser` on the admin route in `api-routes.js`, all in the temporary copy.
The checks confirm the fixture itself is untouched.
Design choice: MD5 in `auth.js` stays on purpose, so an accurate answer has to say "SQL fixed, hash not fixed".

## Step 4 — After a resume, the model disowned its own correct findings

Executed: two forked resumes from the same history, so one could not influence the other: a question about the current state ($0.071), and a neutral one that does not hint at anything ($0.094).
Design choices: `--fork-session` on both, and the session ID instead of the name. A plain, unforked resume was not run. Both forks did get new session IDs.

Observed, against the common expectation of stale advice:
- **Neither recommended an applied fix.** Both re-read the files first, even on the neutral wording: 3 files and 1 file.
- **Both misread the situation.** "SQL injection in `login` was wrong... I made that claim without reading the file." and "I haven't edited any files, so it's in its original state." Those findings were
  correct when made. The model read the new code and concluded it had been wrong.
- **Nothing told it anything changed.** The request contains no notice of a file change. Fresh start and resume differ in this only because the fresh prompt says so.
- **It distrusted good findings on other files too.** The neutral answer ends by questioning its claims on `orders.js`, `payments.js` and `reports.js`, which were correct and are unchanged.
- **Only 2 of 13 tool results came back.** The transcript stores 13, while the first request after resume held 2, and only `users.js` among the fixture files. So the model's "without reading the
  file" follows from what it could see. `auth.js` was read in the original session, but its result was not in the resumed request. The mechanism was not investigated. It may relate to how
  several tool calls in one response are stored, and may be specific to CLI 2.1.77. A newer CLI was not tested.

Commonly assumed: old tool results stay in the history and compete with the new code. Measured here: most of them were absent.

## Step 5 — Fresh with a summary is accurate on the changes, but repeats the summary's errors

Executed: yes, $0.102. No old tool results. Read the 3 changed files, and said it also checked `config.js`. My `filesRead` counts the Read tool only, so "only 3 files" is slightly generous: it looks like it used another tool for that.
It stated correctly that SQL, the connection leak and rate limiting were fixed, that MD5 remains, and that `requireUser` still lets invalid tokens through, so the admin fix does not really protect the route.
Repeated once: the first attempt had an empty summary because of the step 2 failure. Only this session was repeated. The resumed runs are from the same sequence as the saved first session.
Finding: **Fresh is not free of error.** It reports "`issueToken` now passes `config.sessionTtlMinutes`" and "the `verifyToken` doc comment now matches" as changes. Neither line changed. Both come from errors in the first
session, carried by the summary. A summary carries conclusions, including the wrong ones, without the evidence to spot them.

## Step 6 — Fresh wins on accuracy about what happened, not on cost

Files: [comparison.js](comparison.js), [step-6-compare.js](step-6-compare.js)
Executed: yes, 27 of 27 checks, no API cost. Answer assessments were recomputed from saved text after I fixed two false matches in my own scoring: a sentence on `users.js` counted as stale, and a looser old test said old `auth.js` code was in the results when it matched `users.js`.

| Measure | Resume, neutral | Resume, current-state question | Fresh + summary |
|---|---|---|---|
| Files read (Read tool) | 3 | 1 | 3 |
| Told files changed | no | no | yes |
| Tool results in first request | 2 | 2 | 0 |
| Old `auth.js` in those results | no | no | no |
| Treats a fixed issue as open | no | no | no |
| Calls earlier correct findings wrong | yes | yes | no |
| Recognises SQL fix | yes | yes | yes |
| Flags remaining MD5 | yes | yes | yes |
| Cost | $0.094 | $0.071 | $0.102 |

Predictions against this run: recommends applied fixes **did not hold**; refers to old code **did not hold**; analyses all files again **did not hold**; inconsistent statements **held**; fresh recognises the fix **held**; fresh targets the 3 files **held**, with the note in step 5.
Fresh was not cheaper here. Its advantage is accuracy about what happened, not cost. The scoring is by wording and the full answers are saved, so read them rather than relying on the table.

## Viewer

[ui.html](ui.html) and [viewer.js](viewer.js). Page returned 200, and the saved mode ran through the server. The live mode calls the same `runSessionLab` as step 1-5 but was not run through the viewer, because of its cost. Worth having: the runnable behaviour
here is the comparison and the answers.

## Limits

`step-1-5-sessions.js` in its final form has not run end to end. Its last full run passed 17 of 19 checks, and the 2 failures were the summary. The summary and fresh session were then repaired by a one-off script from the saved first answer, and the final checks pass on that saved file. One run of each. CLI 2.1.77 is older than the model and SDK in use, so the lost tool results and the thinking problem may not apply to newer versions. `--fork-session` was used as a tool here, and divergent exploration on its own is not tested.

## Takeaways

1. After files change, start fresh and say what changed. In this run, the real gain was that the model knew about the change, not that old tool results were gone.
2. If you do resume after changes, tell the session which files changed and that the old findings were right at the time. Nothing else will tell it.
3. A resumed session may hold much less than its transcript suggests. Do not treat resume as a complete record; check the request if it matters.
4. A summary preserves errors too. Have the fresh session verify the summary's claims against the code, and do not trust "now" in a report on changes.
5. Resume by name is for people. Scripts must store the session ID, since print mode refuses names in this version.
6. A temporary config directory is not isolation if the working directory sits under the user's home. Check the request for your own instructions.
7. Forking gives comparable branches from one history at no cost for the fork itself, which makes it good for testing "what if I ask differently".
