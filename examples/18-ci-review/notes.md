# 18 Claude Code in CI: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`. Sandbox: [sandbox/](sandbox/), plus two pull-request pushes in [pr-push-1/](pr-push-1/) and [pr-push-2/](pr-push-2/). Pipeline: [../../blueprints/ci-review/scripts/ci-review.js](../../blueprints/ci-review/scripts/ci-review.js).
Each repository was a local temp `git init`. **Nothing was pushed, no repository was created and nothing was posted to GitHub.** A trap `gh` on PATH confirms the dry runs never call it.
**Not executed:** the GitHub Actions workflow, marked `UNEXECUTED` in [its file](../../blueprints/ci-review/.github/workflows/claude-review.yml), and the pipeline's `--post` branch. Checks on the workflow only confirm its marking and that its options exist. The `gh` payload format is from my knowledge of the REST API and was never accepted by GitHub.
Cost, CLI-reported, including superseded runs: [step-6-live.js](step-6-live.js) $0.8048 over three runs; [step-4-5-live.js](step-4-5-live.js) $1.6424 over three runs (one was an accidental re-run after a failed edit, my error). Total about $2.45.

## Without `-p`, the hang depends on stdin (step 1)

Executed: [step-1-3-mechanics.js](step-1-3-mechanics.js), 52 of 52 overall, free. `-p` prints to stdout and exits 0.
**You might expect a job without `-p` to hang.** Here, with no terminal:
- stdin closed, as on many runners: **it answered and exited 0**, as if `-p` were given.
- stdin held open: it waited with no request, killed at 20 s. A real hang.
So `-p` remains right and explicit, but the hang depends on stdin in this version. Tested on Windows only.
Flags against `--help`: `-p`, `--output-format`, `--json-schema`, `--max-budget-usd`, `--allowedTools`, `--disallowedTools` and `--no-session-persistence` are listed. **`--max-turns` is not listed.** It still works: a tool loop stopped after 2 requests, `error_max_turns`.

## Structured output has two silent failure modes (step 2)

Executed: `--json-schema` adds a `StructuredOutput` tool, not forced by `tool_choice`. Validated data lands in `structured_output`, while `result` holds the model's closing text. A schema violation goes back to the model, which corrected it in a scripted retry.
Traps:
- **A model that answers in plain text is retried with no end.** A scripted one made 517 requests in 8 s until killed. `--max-turns 6` did not stop this loop. `--max-budget-usd` did. Always set a budget.
- **Stopping on budget or on turns exits 0 with `is_error: false`.** Only `subtype` shows it. A step relying on the exit code reads that as success. The pipeline fails on any `subtype` other than `success`.
The schema requires each field and adds `previous_id` and `evidence` for step 6. jq is not installed here, and Node parses instead.

## PR comments as a dry run (step 3)

Built: `buildPrCalls` makes one exact `gh api --method POST repos/<repo>/pulls/<pr>/comments --input -` call with `body`, `commit_id`, `path`, `line`, `side`. A finding on a line outside the diff becomes a plain PR comment, since I expect GitHub to reject that inline. `--fail-on critical` gives exit code 3 as a CI gate. No changes, no model call.
Executed: end to end on a real temp diff against the stub. Printed output is in the script's run. No `gh` call occurred.
Node replaces a shell `while read` loop, as messages can hold quotes and newlines.

## A CLAUDE.md section adds what exploring cannot find (step 4)

Executed: [step-4-5-live.js](step-4-5-live.js), 12 of 12. In the final run:

| Project | Cost | Factories used | "should ... when" names | Tests |
|---|---|---|---|---|
| With the section | $0.1129 | yes | 6 | 6 of 6 pass |
| Without | $0.1512 | **yes** | 0 | 11 of 11 pass |

The project without a section still found and used `test/factories/`, by exploring. Its output is not generic boilerplate, at least on this small repo. What the section reliably changed is what exploration cannot find: the naming rule. It held across all three script runs. Under `-p`, CLAUDE.md does load, as shown from the request.

## The review's prompt mattered more than its isolation (step 5)

Executed: separate `claude -p` calls with different session ids. The review's requests contain neither the generation prompt nor its Write call. Same run:

| Review | Findings |
|---|---|
| Pipeline's general prompt, whole diff | 1 |
| Fresh session, focused prompt | 8 |
| Generating session, same focused prompt | 5 |

The direction favours the fresh session, on one run. Only the fresh session noticed that the empty-token test would still pass without the guard. In an earlier run of the script, which had the general prompt only for its independent review, self-review won 4 to 1 (and 6 to 0): **the prompt mattered more than the isolation.** A general "review this PR" misses what a focused one finds. Counts are not quality. I did not judge each finding for correctness.

## Stored findings can anchor an incremental review (step 6)

Executed: [step-6-live.js](step-6-live.js), final form 13 of 13, $0.2226. Push 1: four findings, four comments printed. Push 2 fixed the SQL injection, kept the rest and added a new injection:

| Second review | Comments printed | Fixed SQL injection |
|---|---|---|
| With stored findings | **1**, only the new one | resolved, with its id |
| No stored findings | 4, with 3 repeated | not reported, as it is gone, though not marked either |

Secret and delete stayed open with their original ids.
**The first attempt exposed a trap in the obvious prompt.** Told "Previous findings: ... report still-present ones", the model **repeated the fixed SQL injection as still present, word for word**, though the control review of the same code did not mention it. Past findings anchored it. Two changes followed: the prompt now calls them claims that may be wrong and tells it to read the current file, which fixed this in two live runs; and the pipeline requires an `evidence` quote, and a finding whose quoted line is not in the current file is not believed. That gate is covered by a unit test and did not need to fire in the live runs. Anything the model fails to account for stays open and is flagged, so a finding does not vanish silently.

## Takeaways

- A CI step needs: `-p` with stdin closed, a budget always, a check on `subtype`, and read-only tools for review.
- Give stored findings to the model as claims to verify, and have the code keep the ledger and decide what to post.
- Keep generation and review apart, but spend your effort on the review's prompt first.
- Put into CLAUDE.md what cannot be discovered by reading the repository. Do not rely on an `@` import if the job starts in a subdirectory.
- Reviewing a pull request sends its diff to the model. Do not run on forks with secrets.
