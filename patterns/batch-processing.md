# Batch processing

Send many independent model requests together at half the price, when nothing is waiting for the answers.

## Use when

- Nobody and nothing is blocked on the result: reports, overnight extraction, backfills
- Volume is high enough for the saving to matter
- Each request stands alone, with no tool loop between requests

## Do not use when

- A person or a merge is waiting: chat, pre-merge checks
- The set is small or the model cheap, and the saved cents do not pay for the extra code and waiting
- The deadline is hard and shorter than about twice the processing window, with no synchronous fallback

## Decision

Give each request a `custom_id` that encodes the item and read results only through it. Save the batch ID before waiting, so an interrupted job resumes instead of paying again. A result is usable only with `type: succeeded`, a suitable `stop_reason` and the expected content. Resubmit only failures, each with a change aimed at its failure. Refine the prompt on a small sample first, and judge it on the items outside the sample too.
For a deadline, the interval between submissions plus the 24-hour window must fit the SLA, and expiry needs its own plan.

## Trap

`result.type: succeeded` covers a reply cut off at `max_tokens`, so counting by type alone reported one failure where there were two. An invalid request can also pass `create()` and fail only when processed: forced `tool_choice` on a model that rejects it entered a 20-request batch and errored by itself minutes later. And results arrive out of order, so position pairs the wrong data.

## Example

[batch.js](../examples/23-batch-processing/batch.js): requests, classification, targeted retries. [step-5-full.js](../examples/23-batch-processing/step-5-full.js): a resumable run. [collect-batch.js](../examples/23-batch-processing/collect-batch.js): finishing a pending batch. [workflows.js](../examples/23-batch-processing/workflows.js): the SLA arithmetic.

## Verified

2026-10-31, `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116. Five real batches, the longest ended in about 3 minutes. Twenty requests: 19 succeeded and 1 errored by the API's count, 2 really failed, both by design, and a retry batch of those 2 recovered them. Sample of 5: 100% of fields; 13 others: 98% of 128 fields, 11 of 13 documents fully right. Same five requests: 5,280 input tokens either way, 8 s standard against 93 s batch. Cost is computed from real tokens and documented prices, $0.0014 against $0.0007, and no bill was read, so the discount itself is unverified. Results reported `service_tier: batch`.

## Usual advice vs observed

A batch needs a real 24-hour allowance; here they took about two minutes, on five small batches in one evening, which says nothing about the worst case. The usual SLA sum of window plus buffer assumes success within the window. A request that expires there and goes round again takes up to 48 hours.
