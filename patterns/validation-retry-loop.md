# Validation and retry loop

Check extracted values in code, send back only errors another attempt could fix, and hand the rest to a person.

## Use when

- Values obey rules a schema cannot express: sums, date order, cross-field agreement
- Wrong data is costly downstream and a person can take the unresolved cases

## Do not use when

- There are no rules to check; a retry with no specific error just repeats the attempt
- Output is read by a person who would notice the problem anyway
- Failures are mostly absent information; there, fix the routing and not the retries

## Decision

Give each error `fixable`, set where the error is detected, by looking at the source: if the document has no label for a field, no retry can produce it. Send back the specific errors along with the document and the attempt that failed, with a cap of about three, and an explicit line against adding values to make numbers agree. Believe a
self-reported source conflict only after one round of feedback. Compute sums in code and overwrite the model's; keep its figures as a comparison that blocks nothing. Test the retry path with seeded failures, labelled as such, since a good model may never produce one.

## Trap

Retrying on a field code can compute. One run fixed the line items, then returned the same wrong `calculated_total` through three retries, with the right sum in the feedback, and falsely claimed a conflict, so a correct document would have gone to a person. A second trap is pressure to close a gap: a document with a wrong total can get an invented line, after which every check passes.

## Example

[validate.js](../examples/22-validation-retry/validate.js): errors with `fixable`. [retry-loop.js](../examples/22-validation-retry/retry-loop.js): the loop. [seeded-failures.js](../examples/22-validation-retry/seeded-failures.js): how to force the path.

## Verified

2026-10-31, `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116, about $0.015. Seven documents: 3 with absent information went to a person with 0 retries, a document with a wrong total and one with impossible dates reached a person, and neither got invented data. Two fixable documents passed on the first try, so failures were seeded by hand: 1 retry each, matching the key. Fresh self-reported totals: 20 of 20 right. After a seeded failure, one document's `calculated_total` was wrong in each of 2 runs.

## Usual advice vs observed

Self-correction fields are often presented as detecting discrepancies with no external logic. They were accurate on fresh extractions, yet wrong and stubborn inside a retry. Real dismissal data was not available, so ranking patterns by dismissal rate was tested only with dismissals simulated from a key. A blind retry was not compared with a feedback retry.
