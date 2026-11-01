# Few-shot examples

Add a few worked examples to a prompt, with the reasoning behind each decision, when a measured baseline shows a judgement problem.

## Use when

- A measured baseline shows the same kind of judgement call going differently between inputs or between runs
- Instructions are already complete and the failures persist
- The right decision is easier to show than to state, such as when to return null

## Do not use when

- You have no baseline; on a capable model thorough instructions may already do the job
- The problem is output shape; use structured output
- Values must obey arithmetic or business rules; check them in code
- Data is missing from the input; examples reduce invention a little, but schema and validation are the real guard

## Decision

Measure first, field by field, against known answers, and separate empty, wrong and invented values. Then write two to four examples aimed at the failures you saw, with reasoning, and none taken from your test set.
Keep the rest of the prompt unchanged, so that the examples are the only difference, and compare again. If there is no gain, remove them.

## Trap

Two traps. A sum that does not close can close itself: with a document whose lines added to 335 and whose total said 355, one run added a 20.00 "unexplained difference" line, and a parser reading the JSON saw a clean invoice. Also,
the failure can be in your key. A fair split of one charge into two lines counted as wrong until the failures were read.

## Example

[extract.js](../examples/20-few-shot-examples/extract.js): prompt, examples and measures. [step-5-matrix.js](../examples/20-few-shot-examples/step-5-matrix.js): technique per problem.
[documents-answers.js](../_fixtures/documents-answers.js): the key.

## Verified

2026-10-31, `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116, 10 documents, 3 runs per prompt, about $0.02. No examples: 119 of 120 fields, 0 of 114 empty, 1 of 6 invented, 0 of 30 bare JSON. Examples: 120 of 120, 0 of 114, 0 of 6, 0 of 30. Sparse probes: 7 of 12 invented, then 5 of 12.

## Usual advice vs observed

The usual claim is that instructions alone leave narrative documents with many empty fields, and that examples fix formats and consistency. Here narrative documents were already at 100%, no field was empty, and examples did not change the code fence on any reply. Reasoning against no reasoning was not compared.
