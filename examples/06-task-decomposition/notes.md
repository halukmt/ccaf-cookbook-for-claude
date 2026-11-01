# 06 Task decomposition: notes

All live runs: 2026-10-31, `claude-sonnet-5-5` through the Messages API, sequential. Costs are estimates from token counts
at $3 / $15 per million tokens, since this API reports tokens and not money. Total about $0.46, including two runs
listed under "Extra runs" below. Saved results: [results/](results/).

**The short version: the commonly expected failure did not appear at this scale, and a more useful finding did.** With 12
small files (about 3,900 input tokens), the single pass found 21 of 22 planted defects, including all 6 cross-file ones. The
integration pass on summaries alone found only 2 of 6, because it never sees the code. These are single runs on a small
fixture. This does not disprove attention dilution on larger codebases. It was not tested there.

## Step 1 — A fixture with an answer key, because "more findings" proves nothing alone

Built: `loadCodebase`, plus a reusable fixture of 12 files and an answer key with 22 planted defects (16 local, 6 cross-file),
three SQL concatenations and three empty catch blocks as repeated patterns, and two files with no local defect.
Files: [review.js](review.js), [step-1-load.js](step-1-load.js), [../../_fixtures/codebase/](../../_fixtures/codebase/),
[../../_fixtures/codebase-answers.js](../../_fixtures/codebase-answers.js)
Executed: yes, 13 of 13 checks, no API cost, including tests that the scorer can say no.
Design choice: files are sorted, so order is the same on every machine. A planted answer key exists because
"found more issues" says nothing without knowing what is really there.

## Step 2 — One call with all files found 21 of 22

Built: one call with all files.
Files: [step-2-single-pass.js](step-2-single-pass.js), [results/single-pass.json](results/single-pass.json)
Executed: yes, 4 of 4 checks, $0.065. 29 findings. 21 of 22 planted defects. Finished on `end_turn` with 3,540 output tokens.
Design choices:
- Source lines are numbered in every pass, because models miscount raw lines.
- All passes share one brief and return JSON Lines instead of a free-text parse. A truncated reply then only loses its last line.

Commonly expected: detailed early files and shallow or missing later ones. Measured here: later files were not skipped. The
one miss, no rate limiting on login, is in the first file.

## Step 3 — One call per file finds everything local, plus a lot of noise

Built: one call per file, sequentially.
Files: [step-3-per-file.js](step-3-per-file.js), [results/per-file.json](results/per-file.json)
Executed: yes, 5 of 5 checks, about $0.10. 67 findings in the saved run. All 16 local defects, in each of the two runs.
Design choice: replies go through the JSON Lines parser, not `JSON.parse` of the whole reply. `bugCount` counts all findings,
including style remarks.
Finding: 47 of the 67 findings match no planted defect. Some are real, such as a missing role check on the sales report. Many are
generic advice: validate the input, add a plain-text alternative to the email. Full attention also means more noise, and someone
has to read it.

## Step 4 — The integration pass depends on its input: 2 of 6 versus 6 of 6

Built: `crossFilePass`, with two input modes.
Files: [step-4-cross-file.js](step-4-cross-file.js), [results/cross-file-summaries.json](results/cross-file-summaries.json),
[results/cross-file-contracts.json](results/cross-file-contracts.json)
Executed: both modes, 4 of 4 and 5 of 5 checks.
- Per-file summaries plus import graph: **2 of 6** cross-file defects, $0.046. It reasoned about the architecture, but
  it cannot see that `query` returns `{ rows, rowCount }` or that the config key is `vatRate`.
- Plus code-extracted contracts (the comments and signature of each export, and each line using an import): **6 of 6**, $0.051.
Design choices:
- `contracts` mode exists because summaries and an import graph are too thin to do the job. Findings about a contract cannot come from a
  summary that never mentions the contract.
- `max_tokens` raised from 2048 to 4096. The first run was cut off at exactly 2048, with 11 issues parsed and `stop_reason:
  max_tokens`. The step's check failed, as it should. The response holds a `thinking` block: Sonnet 5.5 returned thinking
  without it being requested, and thinking counts against `max_tokens`.
Pitfall: Your summary format decides what the integration pass can find. A summary of bugs is not a summary of interfaces.

## Step 5 — Measured against common expectations, most did not hold

Built: `buildComparison`, with counts, standard deviation, position slope, detail per file, line accuracy and defects found.
Files: [compare.js](compare.js), [step-5-compare.js](step-5-compare.js)
Executed: yes, 7 of 7 checks, no API cost. The script prints common expectations as HELD or DID NOT HOLD next to the checks.

| Measure | Single pass | Per-file | Prediction |
|---|---|---|---|
| Findings | 29 | 67 | More with multi-pass: held |
| Local defects found, of 16 | 15 | 16 | |
| Std dev of issues per file | 1.38 | 2.53 | Lower with multi-pass: **did not hold** |
| Slope of issues by position | -0.16 | -0.09 | Drop-off in counts: **did not hold** |
| Average finding length, first half vs second half of files | 149 vs 103 chars | 138 vs 138 chars | Shallower later: **held, weakly** |
| Line within 2 of planted line | 100% | 100% | |
| Cross-file defects, of 6 | 6 | 2 | Only the integration pass catches these: **did not hold** |

Design choice: recall against the answer key, position slope, finding length and line accuracy are measured too.
- Raw count variance is a flawed measure. Standard deviation of raw counts assumes files should have similar counts, and they do not: files
  have 0 to 2 planted local defects. Per-file was higher here because it finds more in defect-rich files. Std dev of recall per file
  is the better test: 0.15 vs 0.00.
- Finding length shrinking by 31% is the one sign of dilution. It comes from one run, and it is a rough proxy for depth.
- The single pass sees cross-file problems because it sees all the code. Per-file passes matched 2 of 6: `X-TTL` because the variable name
  `sessionTtlMinutes` gives the unit away, so that defect is less cross-file than intended, and `X-ARGS` as a hedged suspicion only.

## Step 6 — Contradictions: none on planted repeats, one on an unplanned repeat

Built: `findContradictions` over the planted repeats, and `handlerErrorCoverage` over one repeat I had not planted.
Files: [step-6-contradictions.js](step-6-contradictions.js)
Executed: yes, 6 of 6 checks, no API cost.
- Planted repeats, single pass: **no contradiction**. All 3 SQL and all 3 empty-catch sites were flagged, so the commonly expected
  inconsistency did not occur for these. Severity for empty catches was medium or high, which fits since one
  of them reports a failed refund as success.
- Unplanned repeat: **one inconsistency**. Four identical async handlers lack error handling. The single pass flagged line 20 only, and the
  per-file passes flagged all 4 in the saved run. It is real, though less clear-cut than "flagged in file 3, approved in file 11", since
  all four are in the same file and the single pass may have meant it as a general remark.
Design choice: `description.includes(pattern)` cannot match, since descriptions do not quote code patterns.
This uses the answer key's patterns and their wording tests.

## Viewer

[ui.html](ui.html) and [viewer.js](viewer.js). Page returned 200. "Saved comparison" (free) and "Live single pass" both ran through the
server. "Live multi-pass" uses the same functions as steps 3 and 4 but was not run through the viewer.

## Extra runs, and limits of the evidence

- I ran `step-3-per-file.js` a second time by accident, through a leftover in a shell command, at about $0.10. It ran after the other
  calls had finished, so not in parallel. It overwrote the saved file. So `results/per-file.json` comes from the second run, while both
  cross-file results used the first run's summaries. First run: 69 findings, 16 of 16 local. Second: 67, 16 of 16. The match is
  close, but the saved files are not one single pipeline run.
- The first cross-file run, cut off at 2048 tokens, cost about $0.04 and was replaced.
- Scoring is a regular expression on file and wording. I found and fixed false matches by reading every finding (`/rows/` matched "throws"). After
  this, the scores were recomputed from the saved results without new API calls. Later examples should expect some error in either direction.
- The fixture comments state contracts plainly, which helps every approach. Real code is often less explicit.
- `mailer-stub.js` and `provider-stub.js` are imported but not part of the fixture. One finding noticed. They are not planted defects.
- Dynamic adaptive decomposition is not covered by these steps, so nothing here tests it.

## Takeaways

1. Measure before splitting. At about 4,000 tokens of code, a single pass found 21 of 22 at $0.065, versus 22 of 22 at about $0.15 with more
   than twice the findings to read. If the code fits comfortably, a single pass may be the better trade.
2. Per-file passes are the safer choice as size grows, or when complete coverage matters. Here they found the one defect the single pass missed and
   treated repeated code more evenly. This run cannot show where the crossover lies.
3. An integration pass is only as good as its input. Summaries of bugs and an import graph found 2 of 6. Adding extracted interfaces and
   call sites found 6 of 6, at nearly the same cost. Extract these with code.
4. Plant known defects before comparing review approaches. Without an answer key, "more findings" looks like "better".
5. Do not use count variance as a consistency measure when files really differ. Measure recall per file.
6. Budget `max_tokens` for thinking on Sonnet 5.5, and check `stop_reason`. A cut-off review looks like a short review.
