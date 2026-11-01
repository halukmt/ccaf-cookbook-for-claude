# 28 Codebase exploration: notes

All live runs: 2026-10-31 and 2026-11-01, Messages API, sequential, on a temporary copy of `_fixtures/codebase/`, with scratchpad and manifest in the same temporary directory. No CLI or Agent SDK run, so no isolation check applies. `claude-sonnet-5-5` for phases 1 and 2. `claude-haiku-5-5` for summary, crash test and comparison.
Cost, at list price: $0.137 phase 1, $0.085 phase 2, $0.007 crash run, plus its uncounted crashed call, $0.139 first comparison, $0.086 final comparison, about $0.01 for a run stopped by `max_tokens`, $0.001 viewer. **Total about $0.47.**
The test-coverage task and the last sentence of the Phase 2 prompt were reworded after those runs, with the same meaning. [results/](results/) holds the wording that was actually sent.

**Short version: context degradation was not observed, and I do not claim it.** With full history, the arm without a scratchpad listed 25 of 25 exports, the same as with one. The largest final request was 6,668 tokens, far from any limit, so these runs say nothing about attention at scale. The scratchpad's value only appeared when old tool calls were **forcibly dropped**: 15 of 25 without it, 25 of 25 with it. It was not free: 3.8 times the input tokens when nothing was dropped.

## What was measured

Per arm: export names correct and wrong, against real exports parsed from the fixture; file reads; generic wording; input tokens. Not measured: anything inside the model. "Attention shift" is an explanation that these numbers cannot confirm or rule out.

## Step 1 — Subagents keep file content away from the coordinator

Files: [explorer.js](explorer.js), [tasks.js](tasks.js), [workspace.js](workspace.js), [step-1-2-phase1.js](step-1-2-phase1.js)
Executed: 11 of 11 checks with steps 1 and 2.
Real result: the subagents used 45,904 input tokens. The coordinator holds 1,739 tokens of findings, against 3,049 tokens for the whole codebase.
- Truth was computed beforehand, and each answer was checked. The fixture has no tests: reported correctly. **No route reaches `refundCharge`: the agent correctly said no refund flow exists,** instead of inventing one.
- The findings ran long. This is only about 57% of the size of the code itself, in a small fixture. Isolation pays only as code grows, or as reads repeat. 45,904 tokens of input is mostly history resent during loops.

Coordination is done by code on the Messages API and not by a model coordinator, following this repo's preference. Each subagent is a separate conversation. Isolation is real, since the coordinator never gets those histories.
Four investigations, including the order flow. The fixture is functions, so findings carry `functions`.

## Step 2 — A scratchpad the model writes only through one tool

Files: [explorer.js](explorer.js), [results/phase1.json](results/phase1.json) (holds the text; the file itself lived in temp)
Executed: real file, growing after each subagent, and injected by code into the next prompt.
The model's only write path is `report_findings`, and file names it reports must really exist. The run did not record whether that check ever fired, so nothing can be said about it.

## Step 3 — The summary did not stop re-reading

Files: [step-3-phase2.js](step-3-phase2.js), [results/phase2.json](results/phase2.json)
Executed: 6 of 6 checks. Both planted cross-file defects were found.
**The summary did not stop re-reading.** 6 of 7 Phase 2 reads were files Phase 1 had also read, and rightly so, because the task required exact lines. The summary contained the answer already, partly: it stated the 100x charge. No comparison without a summary was run, so cold-start duplication is not measured.
Check corrected after the run: a check for the literal `router.post(` failed on the harmless text `router.post(/orders)`, and now compares with 121 real source lines.

## Step 4 — A forced crash resumes from the manifest

Files: [session-run.js](session-run.js), [step-4-crash.js](step-4-crash.js), [results/crash-resume.json](results/crash-resume.json)
Executed: 16 of 16 checks. The crash is **forced**; the rest is real. A child process died with exit code 137 on its first file read of task 3. A new process loaded the manifest, ran only tasks 3 and 4, with the two earlier findings in its prompts, and finished. All four answers were right afterwards.
Writes go through a rename, so a crash cannot leave half a manifest. The check `leftoverTemp` confirms none was left. A checkpoint is written after each report, not only each task.
Limit: usage for the crashed task was lost with the process, as `usage` only saves on completion.

## Step 5 — A scratchpad only helped once history was dropped

Files: [comparison.js](comparison.js), [step-5-compare.js](step-5-compare.js), [results/comparison.json](results/comparison.json), [results/comparison-naive-injection.json](results/comparison-naive-injection.json)
Executed: 10 of 10 checks, four arms, 12 modules, Haiku 5.5, one run each. Comparing 25 known exports:

| Arm | Correct | Wrong | Reads | Input tokens |
|---|---|---|---|---|
| No scratchpad, full history | 25 | 0 | 12 | 96,101 |
| Scratchpad, full history | 25 | 0 | 12 | 368,690 |
| Forced: no scratchpad, old tool calls dropped | 15 | 2 | 17 | 59,020 |
| Forced: scratchpad, old tool calls dropped | 25 | 0 | 13 | 156,940 |

Reading the table:
- **The expected drift to "typical patterns" did not occur.** No arm used a single generic phrase. `measureSpecificity` looks for `.js`, since a search for `.ts` would read 0 here.
- The four-arm shape is my choice. The two full-history arms tied. Dropped tool history is a forced stand-in for compaction, since 12 small files do not fill a context window.
- Without tool history or a scratchpad, the model did not bluff. It marked gaps as "not recorded", and ended: "None of these are verified... my earlier claims to have read these files were not backed by tool calls." It distrusted its own earlier true statements, as example 07 also saw. Yet 2 of its entries were wrong: `requireUser` under `auth.js` and `sendOrderEmail` under `orders.js`. It flagged the first of those as unconfirmed.
- It read 17 times against 12, so losing history caused real re-reading.

Build errors worth keeping:
- The first scratchpad version injected the file into each user message and kept every copy: 651,505 input tokens for one arm. It now keeps only the newest copy. Even so, **a scratchpad written verbosely costs real money**, 3.8 times here, where it had no recall benefit.
- `max_tokens` of 1500 stopped one run, because the agent writes long scratchpad entries. It is 4000 now.
- Scorer corrections, applied to saved text: prose around file names counted as claims, in two different forms.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Saved results are the default. Checked: route 200, saved run with 34 events, a live subagent at $0.0013 that traced the missing refund flow correctly.

## Takeaways

1. Add a scratchpad when a session will really lose context: compaction, multiple sessions, or handover. In a session that fits, it is cost with no gain.
2. Inject one copy, and keep entries short. Otherwise your mitigation grows quadratically.
3. Delegate for isolation when reading is large compared with the findings. On 12 small files, it was close to break-even.
4. Checkpoint to a file, atomically, after each meaningful step, with a `nextSteps` list. A real kill and a real restart is the only meaningful test.
5. Measure before claiming degradation. Recall against ground truth and token counts are cheap. Check what your project really does at its real context sizes.
