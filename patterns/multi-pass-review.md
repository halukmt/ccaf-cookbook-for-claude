# Multi-pass review

Analyse each item in its own call, then run a separate integration pass over extracted interfaces.

## Use when

- The material is too large to fit comfortably in one call, or findings thin out towards the end of a long response
- Every file must get a comparable review, for example as a compliance or merge gate
- Defects can sit between modules: units, return shapes, call order, shared config keys

## Do not use when

- The code fits easily in one call and an occasional miss is acceptable; a single pass was nearly as good and much cheaper at small scale
- Nobody will read the extra findings; per-item passes produce considerably more low-value remarks

## Decision

Measure on your own code first: plant known defects and score each approach, because a raw finding count says little. If you split, give
the integration pass the contracts it needs. Extract each export's comment and signature, and each line that uses an import, with
code rather than asking a model to summarise them. Keep the brief the same across passes, ask for one JSON object per line so a
cut-off reply loses only one line, and treat `stop_reason: max_tokens` as a failure.

A confidence score can sort findings for routing, if the prompt says what high and low mean, but check it against labelled data. A fresh instance that sees only the code and the claim verifies truth, not whether a finding deserves a developer's time, so it cannot set a threshold alone. Mix false claims into its input to prove it can say no, and show it the code a claim depends on.

## Trap

An integration pass fed only with bug summaries and an import graph looks like it works: it returns confident architectural remarks, yet it
misses what it cannot see. It found 2 of 6 planted cross-file defects, and 6 of 6 once it received the interfaces. A second trap is judging
consistency by the standard deviation of issue counts: files differ, so measure recall per file against known defects.

## Example

[review.js](../examples/06-task-decomposition/review.js): `perFileReview`, `crossFilePass`, `extractContracts`.
[step-5-compare.js](../examples/06-task-decomposition/step-5-compare.js): scoring against an answer key.
[codebase-answers.js](../_fixtures/codebase-answers.js): the planted defects.
[passes.js](../examples/24-multi-pass-review/passes.js): confidence routing, independent verification, false control claims.

## Verified

2026-10-31, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 0.116, 12 small files with 22 planted defects, about 3,900 input tokens. Single pass: 29 findings,
21 of 22, about $0.065. Per-file: 67 findings, all 16 local defects. Integration: 2 of 6 with summaries, 6 of 6 with contracts. Sonnet 5.5 returned
thinking blocks unrequested, and one integration run hit a `max_tokens` of 2048 because of them. Each figure is from one run, except per-file, which ran twice with 16 of 16 both times.

2026-10-31, `claude-sonnet-5-5`, same SDK, 10 of those files with 19 defects in scope, about $0.33 at the documented $2 / $10. Single pass: 13 of 14 local and 5 of 5 cross-file, including SQL injections placed 6th and 7th. Per-file: 14 of 14 local. Integration: 2 of 5 on structured findings, 5 of 5 with interfaces. Confidence on 35 findings: 14 at or above 0.80, all matching a planted defect, against 2 of 21 below. Fresh verification of 18 findings: 17 confirmed, none overturned of 8 at or above 0.80, and 4 of 4 false control claims rejected. Each figure is one run. Same-session self-review was not compared.

## Usual advice vs observed

The usual argument says a single pass degrades on later files, and that only an integration pass catches cross-file problems. At this small scale, the
single pass found all 6 cross-file defects, since it sees all the code, and did not drop in issue count for later files. The one sign of dilution was
finding length, 31% shorter in the second half of the files, plus an identical handler flagged once out of four times. This was not tested on a larger
codebase, where the usual argument may well hold.
