# 22 Validation and retry: notes

All live runs: 2026-10-31, `claude-haiku-5-5`, sequential, forced tool. Total about $0.015, estimated from tokens and the documented list price, including the first loop run that was replaced.
Saved results: [results/](results/). Scripts read them back unless `--force` is passed.

**Short version:** the boundary held: absent information went to a person with no retry, and fixable errors recovered in one retry. But the fixable documents did **not** fail by themselves, so the retry path was only tested from hand-written bad
extractions. The most useful result: asked to fix one error, the model repeated a wrong `calculated_total` through three retries, with the right answer in the feedback. Self-reported numbers should not decide anything.

## Step 1: a schema with the data and the model's own assessment of it

Built: `extract_invoice` with extraction data and self-assessment, `detected_pattern` per line item.
Files: [extraction.js](extraction.js), [step-1-2-validate.js](step-1-2-validate.js)
Executed: yes, through the script below, no cost.
`conflict_detected` is required too, and absent fields are nullable, or they would come back invented. `detected_pattern` is an enum of document features, since free strings cannot be grouped.

## Step 2: a validator whose messages state what was expected and found

Built: four categories (completeness, sums, enum, date order), each message with expected and found.
Files: [validate.js](validate.js), [step-1-2-validate.js](step-1-2-validate.js)
Executed: yes, 20 of 20 checks, no cost.
A plain `!==` between the sum and the stated total compares floats exactly, so 0.1 + 0.2 style sums would raise a false flag. The validator uses a tolerance everywhere. It also checks for invented amounts and for values with no basis in the source.

## Step 3: a retry that sends back only what another attempt can fix

Built: a retry message carrying the source text, the bad extraction and the exact errors, capped at 3.
Files: [retry-loop.js](retry-loop.js)
Executed: yes, through step 4.
Only fixable errors are sent back. A line tells the model not to add values to make numbers agree, since an invented balancing line appeared in a run of [the few-shot probes](../20-few-shot-examples/notes.md).

## Step 4: the boundary holds, and self-reported arithmetic does not

Built: 7 documents: 2 fixable, 3 with absent information and 2 whose own figures are wrong, plus seeded failures.
Files: [step-3-4-loop.js](step-3-4-loop.js), [seeded-failures.js](seeded-failures.js), [results/loop.json](results/loop.json), [results/loop-first-run.json](results/loop-first-run.json)
Executed: yes, 19 of 19 checks.

| Document | Kind | First-pass errors | Retries | Outcome |
|---|---|---|---|---|
| d10 | fixable, natural | none | 0 | clean |
| d18 | fixable, natural | none | 0 | clean |
| d10 | **seeded**: subtotal read as a charge | sum mismatch | 1 | clean, matches key |
| d18 | **seeded**: unit price read as amount | sum mismatch | 1 | clean, matches key |
| d13 | absent | due date, tax ID, items | 0 | person |
| d03 | absent | due date | 0 | person |
| d20 | absent | due date | 0 | person |
| d16 | document's total is wrong | sum mismatch | 1 | person, source conflict, no invented line |
| d17 | due date before invoice date | source conflict | 0 | person |

Expected going in: the fixable documents fail and recover by themselves. They passed first time, 2 of 2, so I wrote the failed extractions by hand. **The first attempt in those two runs was not a model output.** The retries were.
Design choices:
- Fixability is not inferred by matching words in messages, which breaks as soon as a message changes, and a default that sends every unknown error to a person is avoided too. Each error carries `fixable`, decided where the error is made, by looking at the source: does it label this field at all?
- A sum mismatch gets one retry even when the model calls it a conflict, because a misread looks the same. Only after feedback is a self-reported conflict believed.

**Finding, first run ($0.0041, kept in `loop-first-run.json`).** On seeded d10, the first retry fixed the items, 600 + 200 - 80 + 57.60 = 777.60. It also returned `calculated_total: 697.6` and `conflict_detected: true`, which was false. The feedback said "calculated_total is 697.6, but the line items sum to 777.6". It gave the same wrong number in the next two
retries, and the check failed. The loop was spending retries on a field code can compute. I changed the design: the model's arithmetic and flags are now advisory, trigger no retry, and `applyCodeFigures` replaces them. The replacement run got `697.6` again, the same error, and d10 finished clean after one retry.
This goes against the idea that these fields can detect errors with no logic outside the model. It also doesn't mean the fields are always wrong: on 20 fresh extractions they were right 20 of 20 (step 5). The failure occurred only in the retry path, in this case.

## Step 5: the ranking runs, on one simulated dismissal

Built: per-line-item log over all 20 documents, ranked by frequency times dismissal rate.
Files: [patterns.js](patterns.js), [step-5-patterns.js](step-5-patterns.js), [results/pattern-log.json](results/pattern-log.json)
Executed: yes, 6 of 6 checks, $0.0063.
**The dismissals are simulated.** No developer dismissed anything: a line item counts as dismissed when its amount is not in the answer key. That is the mechanism, not evidence of what reviewers do.
Result: 43 line items, 1 dismissed, `prose_sentence` at 1 of 12. It is the single line item on the fragment `d14`. With one data point, the ranking works and proves little; a prioritised table needs real dismissal volume.
Self-report on fresh extractions: `calculated_total` 20 of 20 right, `conflict_detected` 2 of 2 real conflicts with 0 false alarms on 18.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved mode at no cost, and one live loop on seeded d10 through the server at $0.0004.

## Takeaways

1. Compute everything code can compute. Asking a model for a sum is fine as a second opinion. Letting it decide or block is how retries get wasted.
2. Decide fixability from the source: is the information there at all? That sent all 3 absent-information documents to a person with zero retries.
3. Believe a claimed source conflict only after feedback. On the first pass it can hide a misread.
4. A document that is wrong in itself is a separate category. Retrying it to agreement is how an invented line appears. The loop kept 355 against 335 here, and handed it over.
5. A capable model may never fail on your fixable cases, so test the path with a seeded failure, labelled as such. An unused retry loop is untested code.
6. Pattern priorities need real dismissals. One simulated dismissal shows that the arithmetic runs, nothing more.
