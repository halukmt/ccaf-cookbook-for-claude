# 24 Multi-pass review: notes

All live runs: 2026-10-31, `claude-sonnet-5-5`, sequential. Total about $0.33, computed from real tokens and the documented list price of $2 / $10 per million tokens, plus $0.003 for the viewer check. Saved results: [results/](results/).
Scripts read them back unless `--force` is passed. The single and per-file passes, the parser and the contract extraction are imported from [the task decomposition pipeline](../../examples/06-task-decomposition/review.js), not copied. Its notes estimate cost at $3 / $15, which is higher than the listed price, so its dollar figures run high.

**Short version:** no sign of attention dilution in a 10-file PR, again. The single pass caught the SQL injections at positions 6 and 7, and all 5 cross-file defects. An integration pass fed findings alone found 2 of 5, and with extracted interfaces 5 of 5. Confidence separated planted defects from the rest well, yet independent review confirmed nearly everything, including low-confidence findings. So it does not calibrate a threshold.
One run per pass, small PR. Attention dilution on a large PR was not tested.

The saved runs used earlier wordings of the opening lines of three prompts in [passes.js](passes.js) (integration, confidence, verification), with the same meaning as the text now there.

## The PR

10 of the 12 fixture files. `users.js` and `utils.js` stay out, since dropping them loses the fewest defects. `reports.js` and `auth.js`, each with a SQL injection, are placed 6th and 7th, in the middle of the review, by order and not by edit. Defects depending on removed files are not scored: 14 local, 5 cross-file, 19 in all.
Files: [pr.js](pr.js)
The PR comes from the existing fixture, so it shares the same answer key.

## Steps 1 and 2: the single pass misses one local defect, and per-file misses cross-file ones

Files: [step-1-2-baseline.js](step-1-2-baseline.js), [results/single-pass.json](results/single-pass.json), [results/per-file.json](results/per-file.json)
Executed: yes, 6 of 6 checks. $0.037 and $0.057.

| | Single pass | Per file |
|---|---|---|
| Local defects, of 14 | 13 | 14 |
| Cross-file defects, of 5 | 5 | 1 |
| Findings | 28 | 61 |
| Matching no planted defect | 9 | 41 |
| Finding length, first five vs last five files | 122 vs 110 chars | 163 vs 125 chars |

Expected going in: an obvious bug missed in a middle file **did not hold**; both SQL injections were caught. Shallower later files by 20% or more **did not hold**, 10%, and per-file passes shrank more, so this measure reflects the files. A repeated pattern flagged in one file and not another **did not hold**; every planted repeat was flagged, though empty catch was rated medium in two files and high in the third, which fits, as that one hides a failed refund. Per-file catching what the single pass missed **held**, by one, `API-RATE`.
Per-file calls run in sequence and not through `Promise.all`, on the repo's rule against parallel API runs. Review depth and finding counts are computed, with average length as a rough depth proxy.

## Step 3: an integration pass finds what its input contains

Built: findings as structured data, three named categories. A second arm adds interfaces extracted by code.
Files: [passes.js](passes.js), [step-3-integration.js](step-3-integration.js)
Executed: yes, 5 of 5 checks, $0.035 and $0.039.

| Input | Findings | Planted cross-file, of 5 |
|---|---|---|
| Structured findings alone | 16 | 2: `X-UNITS`, `X-TTL` |
| Plus extracted interfaces | 14 | 5 |

Expected going in: an integration pass over findings catches cross-file issues that per-file review cannot. This **held only in part**. Most of what it reported was inference from remarks. This repeats the earlier result with a different prompt and structured input: the limit is what the input contains, not its format.
The contradictory-finding category did get used, 2 issues per arm, and they are real observations: access checks each assuming the other layer enforces them.

## Step 4: confidence sorts planted defects from the rest

Built: per-file review with confidence and reasoning on each finding, routing at 0.80.
Files: [step-4-confidence.js](step-4-confidence.js), [results/confidence-reviews.json](results/confidence-reviews.json)
Executed: yes, 6 of 6 checks, $0.070.
35 findings: 14 direct, 21 to the queue. Findings matching a planted defect: direct 14 of 14, queue 2 of 21 (corrected on 2026-11-01, see below; first scored as 13 of 14). The prompt asked the model to use the full range, and it did, with a gap between 0.6 and 0.85.
The prompt says what high and low should mean, since an uninstructed scale may pile up near the top. I did not measure that uninstructed case. Severity levels here are critical, major, minor.
Scorer correction, 2026-11-01: this pass first showed `PAY-LOG` as missed, which was false. The finding reads "Sensitive card data (full card number and CVC) is logged in plaintext", at 0.97, and the fixture's expression accepted only "log" or "logs". The expression now also accepts "logged". Re-scored from the saved results with no model call: 13 local defects, up from 12, and direct 14 of 14, up from 13. No other figure in this example changed: all other saved passes already matched `PAY-LOG`, and that 0.97 finding is not in the verification sample, so the stored `matchesKey` values and the calibration table stay right.

## Step 5: an independent check verifies truth, not importance

Built: fresh calls that get only the file and the claim, not the reasoning, the confidence or any history. Four false claims about real code were mixed in.
Files: [step-5-calibration.js](step-5-calibration.js), [results/verifications.json](results/verifications.json), [results/calibration.json](results/calibration.json)
Executed: yes, 5 of 5 checks, $0.087 for 22 calls.

| Confidence band | Verified | Confirmed | Match a planted defect |
|---|---|---|---|
| below 0.6 | 6 | 5, 83% | 0 |
| 0.6-0.7 | 4 | 4, 100% | 2 |
| 0.7-0.8 | 0 | no findings | |
| 0.8-0.9 | 2 | 2, 100% | 2 |
| 0.9-1.0 | 6 | 6, 100% | 6 |

Controls: 4 of 4 false claims rejected, so a confirmation means something.
Expected going in: some high-confidence findings would be overturned. This **did not occur**, 0 of 8 at 0.80 or above. Only two bands reach 5 findings, and only 0.9-1.0 reaches 90%. This data does not justify moving the threshold.
What it does show: the fresh instance answers "is this claim true of this code?". Low confidence here mostly meant "true, but speculative or low value, or depends on code not shown". The planted-defect column separates the bands far better than the confirmation column. Calibrating a threshold needs labels for "worth a developer's time", and an independent yes/no on truth does not supply that.
Limits: 18 of 35 findings, taken in file order within each band and not at random, with bands from 0 to 6. The single rejected finding, confidence 0.3, was rejected because the called function is in another file, so a verifier shown one file cannot judge such claims. Same-session self-review was not compared with this.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved mode at no cost, and one live verification of a false claim through the server at $0.0027, rejected. A full review is not offered from the page because of its cost. The steps run from the terminal.

## Takeaways

1. Test dilution on your own size of input. At this size a single pass was the better value: 18 of 19 for $0.037, against 19 of 19 for per-file plus interfaces at $0.096 with more than twice the findings to read.
2. Split when coverage must be provable or the input is really large, and then give the integration pass extracted interfaces. Findings alone: 2 of 5. With interfaces: 5 of 5, at about the same price.
3. Confidence is useful for sorting: 14 of 14 above 0.8 matched a planted defect, against 2 of 21 below. That rests on one run and on a prompt that defined the scale.
4. An independent check verifies truth, not importance. It confirmed almost all, so it cannot alone set a routing threshold. Use labelled data.
5. Test the judge with false claims. A judge that confirms everything would have looked the same in this table.
6. Show a verifier the code a claim depends on. With one file, it cannot judge a claim about another.
