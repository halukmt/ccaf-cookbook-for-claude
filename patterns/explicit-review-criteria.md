# Explicit review criteria

Tell a reviewing model what to report and what to skip, instead of asking it to be careful.

## Use when

- A model judges code or documents, and people act on what it flags
- Reviewers have started ignoring results because of noise
- Results differ between runs on the same input

## Do not use when

- Nobody acts on individual findings, as in a one-off exploratory read
- You have no labelled examples and no way to get them; you could not tell whether the criteria helped

## Decision

Write a report list and an equally specific skip list. Define contradiction for comments, and require the reviewer to name the input that breaks suspicious code. Then
label a small set that includes code that looks wrong but is fine, run each prompt several times, and compute false positives, recall and stability per category with the
sample size attached. A category above your threshold, 25% here, is removed by code after the response, and comes back only when refined criteria pass on a fresh set.

## Trap

"Be conservative" reads like a filter but changes little: it gives no boundary to apply. The second trap is judging by recall. Both prompts here found every real issue, so
only labelled clean code exposed the difference. The third is tuning edge cases on the set you score with: that gave a perfect result, which proves little.

## Example

[review.js](../examples/19-explicit-criteria/review.js): prompts and scoring. [trust-recovery.js](../examples/19-explicit-criteria/trust-recovery.js): disabling and refinement.
[review-snippets.js](../_fixtures/review-snippets.js): the labelled set.

## Verified

2026-10-31, `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116, 16 snippets, 3 runs per prompt. False positives: vague 15 of 24, explicit 4 of 24, explicit plus edge cases 0 of 24 (tuned on this set).
Real issues found: 24 of 24 for all three. Snippets unstable across runs: 4 of 16, 2 of 16, 0 of 16. About $0.025 at list price. Sonnet was not tested.

## Usual advice vs observed

The usual warning says vague prompts misclassify: nitpicks marked critical, bugs missed. Here no false positive rose above `minor` and no bug was missed. The cost of vagueness was noise. Instability was 25%, under the often quoted 30-50%. Whether disabling a noisy category restores people's trust in the others was not measured.
