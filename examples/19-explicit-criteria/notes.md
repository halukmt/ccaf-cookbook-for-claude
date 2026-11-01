# 19 Explicit review criteria: notes

All live runs: 2026-10-31, `claude-haiku-5-5`, sequential. Total about $0.025, estimated from real tokens and the documented
list price of $0.10 / $0.50 per million tokens. Saved results: [results/](results/). Scripts read saved results back, so a re-run
costs nothing unless `--force` is passed.

**Short version:** explicit criteria cut false positives from 63% to 17% of 24 skip decisions, with no real issue lost. The vague prompt was
less wrong than expected: it never missed a bug and never inflated a nitpick, so its fault is noise, not misclassification. These
figures come from one model, three runs and 16 small snippets. Sonnet 5.5 was not tested.

The saved runs used earlier wordings of `VAGUE_PROMPT` and of the SQL line in `SEVERITY_EXAMPLES`, with the same meaning as the text now in [review.js](review.js).

## Test set

Files: [../../_fixtures/review-snippets.js](../../_fixtures/review-snippets.js)
16 labelled snippets: 8 to report, 8 to skip. Five are cut from the codebase fixture around defects in its answer key. A five-snippet
core is a marked subset. I enlarged the set beyond five because a per-category false-positive rate on five snippets is
meaningless.

## Step 1: the vague prompt adds noise, not wrong severities

Built: a one-line vague prompt on the core 5.
Files: [review.js](review.js), [step-1-vague.js](step-1-vague.js)
Executed: yes, 4 of 4 checks, $0.0007. 2 of 3 skip snippets flagged, always at `minor`. Both report snippets correct, at the expected severity.
Output goes through `output_config.format` so scoring reads fields. The format is the same for all prompts.
Expected going in: nitpicks marked critical, and bugs missed or marked minor. Neither happened. Across the later 48 vague
decisions, no false positive was above `minor`.

## Step 2: named skips work, and the noise moves elsewhere

Built: report list, skip list, comment rule.
Files: [step-2-criteria.js](step-2-criteria.js)
Executed: yes, 6 of 6 checks. Unused variable and naming now skipped. In this run the accurate comment was flagged instead, with a speculation about
exceptions.
The criteria include a skip line for correct code that looks suspicious, and the requirement to name the breaking input.

## Step 3: severity set by code patterns, with no gain shown

Built: named code patterns at critical, major and minor.
Files: [step-3-severity.js](step-3-severity.js)
Executed: yes, 5 of 5 checks.
The minor pattern is a low-impact real defect. Inconsistent naming would conflict with step 2, which tells the model to skip naming.
Not shown: that code examples beat prose for severity. Severity accuracy was 88% of 24 with or without them across vague and explicit, and I did not run a prose-severity arm.

## Step 4: explicit criteria cut false positives and lose no recall

Built: 2 prompts, 3 runs, 16 snippets, 96 calls.
Files: [step-4-compare.js](step-4-compare.js), [results/step-4-compare.json](results/step-4-compare.json)
Executed: yes, 4 of 4 checks, $0.0126. Decisions are per snippet per run.

| | Vague | Explicit |
|---|---|---|
| False positives | 15 of 24, 63% | 4 of 24, 17% |
| Real issues found | 24 of 24, 100% | 24 of 24, 100% |
| Precision | 62% | 86% |
| Top severity as labelled | 88% of 24 | 88% of 24 |
| Snippets whose label changed between runs | 4 of 16, 25% | 2 of 16, 13% |

Expected going in: fewer false positives **held**. Vague at 30-50% inconsistency **did not hold**, 25%. Explicit below 15% **held**, narrowly, on 16 snippets.
On the core 5 alone, explicit was worse on inconsistency than vague: 2 of 5 against 1 of 5. Five snippets cannot carry this measure.
Beyond precision, the script measures recall, severity match and stability. Stability needs repeat runs, which a single per-snippet loop could not give.
The label is debatable in one place: `doc-accurate` flagged because a throw ends the retries early. That is a real observation about the code, though the comment does not contradict it. It counts as a false positive here.

## Step 5: noise sits in a few categories, on small samples

Built: per-category rates, removal by code after the answer, refinements with code examples, a live re-test.
Files: [trust-recovery.js](trust-recovery.js), [step-5-trust-recovery.js](step-5-trust-recovery.js), [results/refinement-plan.json](results/refinement-plan.json)
Executed: yes, 6 of 6 checks, $0.0077 for 48 calls.

| Category | Vague | Explicit | Explicit plus edge cases |
|---|---|---|---|
| security | 0% of 9 | 0% of 9 | 0% of 9 |
| logic | 9% of 11 | 17% of 12 | 0% of 9 |
| documentation_mismatch | **40% of 10** | 0% of 6 | 0% of 6 |
| style | **100% of 9** | **100% of 2** | none reported |
| unused_code | **100% of 5** | none reported | none reported |
| other | **100% of 2** | none reported | none reported |

Disabling `style` on the explicit prompt: false positives 4 to 2 of 24, precision 86% to 92%, recall unchanged. `style` is over the threshold on only 2 findings,
so that decision rests on very little.
Rates are computed, not hardcoded. `documentation_mismatch` came out at exactly 40%, on the vague prompt
and on 10 findings, and the explicit comment rule alone took it to 0 of 6.
Not measured: the "trust bleed" effect. No developers took part, so nothing here shows how disabling one category changes what people think of the rest. Precision is the only thing computed.
Limit: the edge cases were written after reading this set's false positives, so the 0 of 24 is a tuned result on its own test data, and it needs a fresh test set before it counts.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved mode at no cost, and one live run on `naming-inconsistency` through the server at $0.0003.

## Takeaways

1. Asking for conservatism did not make this model quiet. It flagged nitpicks on 63% of skip decisions. Naming what to skip took that to 17%.
2. Write the skip list as carefully as the report list. Every fix here was a skip rule. No report rule was needed, since recall was already 100%.
3. A rule on comments must define contradiction. Without one, the model called harmless history and TODOs a mismatch: 40% false in that category.
4. Measure per category, with the sample next to it. "Style 100%" here means 2 findings.
5. Edge-case examples drove false positives to 0 of 24, on the set they were written from. Treat that as a hypothesis until retested.
6. Remove a disabled category in code after the answer. It cannot then reappear through a prompt change.
