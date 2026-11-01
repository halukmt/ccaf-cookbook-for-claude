# 23 Batch processing: notes

All live runs: 2026-10-31, sequential, `claude-haiku-5-5`. Four batches, all ended well inside the 15-minute limit. Nothing is pending. Total about $0.006, computed.

**How to read the money:** tokens and timestamps are real, from API responses. Prices are documented ($0.10 / $0.50 per million, batch at 50%), from the API reference cached 2026-10-06. Dollars are computed from both. The API returns no money and no invoice was read, so **the 50% discount itself was not verified**; the results did report `service_tier: batch`.

SDK: `@anthropic-ai/sdk` 0.116 exposes `client.messages.batches.create`, `.retrieve` and `.results`, checked before use. `client.batches` does not exist there. `.results` returns a decoder, not an array, so calling `results.filter` on it would fail.

## Step 1: who is waiting decides between blocking and batch

Built: 5 workflows, with who is waiting.
Files: [workflows.js](workflows.js), [step-1-2-3-4-offline.js](step-1-2-3-4-offline.js)
Executed: yes, no cost.
The `waiting` column is the test that decides it. "Document extraction overnight" is fine only if the morning job allows for the window, since a batch can take 24 hours and overnight is shorter.

## Step 2: twenty requests, each findable by its `custom_id`

Built: 20 requests, each with `custom_id` such as `doc-invoice-000-d01`, own params and a forced tool.
Files: [batch.js](batch.js)
Executed: yes, 5 of 5 checks on the definition, then sent for real in step 5.

## Step 3: "succeeded" does not mean usable

Built: classify each result, list failures by `custom_id`, retry with a change suited to the failure.
Files: [batch.js](batch.js), [step-5-full.js](step-5-full.js)
Executed: offline against constructed results of each kind, then with real failures.
A filter on `result.type === "errored"` is not enough. A reply cut off at `max_tokens` counts as `succeeded`, so that filter misses it. The real run proved it: the API counted 19 succeeded and 1 errored, while 2 had really failed. Oversized documents are not chunked, since no document here is oversized.

## Step 4: an SLA minus the window gives the longest interval

Built: longest interval, latest submission, worst case for an arrival at any minute.
Executed: yes, no cost. 30 h minus 24 h leaves an interval of at most 6 h. Due Monday 09:00 means submitting by Sunday 03:00. 4.5 h gives a worst case of 28.5 h, and 7 h gives 31 h, which misses.
`Math.floor` on 4.5 gives 4, so the script prints the computed worst case instead of a rounded interval.
Limit: the sums assume success within the window. A request that expires at 24 hours and is resubmitted needs up to 48 h, so a 30 h SLA cannot be guaranteed by batches alone, only made likely, unless a synchronous fallback handles the leftovers within the remaining 6 h. Measured times here, 93 to 129 s, say nothing about that worst case.

## Step 5: an invalid request fails alone, and a tuned sample overstates quality

Built: prompt versions on a 5-document batch, then 20 documents with 2 deliberate failures, then a retry batch.
Files: [prompts.js](prompts.js), [step-5-sample.js](step-5-sample.js), [step-5-full.js](step-5-full.js), [collect-batch.js](collect-batch.js), [results/](results/)
Executed: yes.

| Batch | ID | Time | Result |
|---|---|---|---|
| Sample, prompt v1 | `msgbatch_01NhuG5XNtYYyU3iEwmFWb6T` | 117 s | 96% of 50 fields, 3 of 5 documents fully right |
| Sample, prompt v2 | `msgbatch_01W8fyuvJXbMpzUnD7AVYkhV` | 93 s | 100% of 50 fields, 5 of 5 |
| Full, 20 | `msgbatch_01JP64yVpV1EptiWmrVy5H78` | 129 s | 19 succeeded, 1 errored, 2 really failed |
| Retry, 2 | `msgbatch_01FTUSEZdkNaXQyspyheMzMk` | about 2 min | 2 of 2 usable |

The failures, as designed: `d02` with forced `tool_choice` on Sonnet 5.5 and `d05` with `max_tokens: 30`.
**The batch API accepted the invalid request at create time.** It became `errored` for that request alone, with the same message as the synchronous 400, and the other 19 went on. The failure surfaces 2 minutes later, not at submission.
Results came back in a different order from the requests in all batches, with `doc-receipt-005-d06` first, so reading by position would have paired the wrong data.

First pass, 18 usable requests: 99% of 178 fields, 16 of 18 documents fully right. The 13 usable documents outside the sample: 98% of 128 fields, 11 fully right, a fairer figure, since v2 was tuned on the sample. After retries: 99% of 198 fields, 18 of 20.
Remaining wrong fields: `d14` got "accounts" as a vendor, and `d10`'s line items omitted the discount and tax. A check as in [the validation loop](../22-validation-retry/notes.md) would catch the second, as the items do not add to the total.
A 90% accuracy target: by field, v1 already passed with 96%. By whole document it had 60%. Which measure you pick decides whether refining looks necessary. I refined, and the sample then overstated quality: 100% on the sample, 11 of 13 elsewhere.
Sampling and refining were done by hand: I chose five documents across layouts and known traps, and wrote v2 by reading the errors. Only two iterations were needed.
Resume: each batch's ID is saved before waiting, so re-running a step reads the same batch. Re-run and `collect-batch.js` were checked, submitting nothing new.

## Step 6: the same tokens at half the computed price, and 12 times the wait

Built: the same five requests through the standard API.
Files: [step-6-discount.js](step-6-discount.js), [results/discount.json](results/discount.json)
Executed: yes, 5 of 5 checks.

| Five documents | Input tokens | Output tokens | Time | Computed cost |
|---|---|---|---|---|
| Standard, in sequence | 5,280 | 1,666 | 8 s | $0.0014 |
| Batch | 5,280 | 1,669 | 93 s | $0.0007 |

Token use matched, 12 times the time here. The saving is real in proportion and small in money on this cheap model and this small set: the whole 20-document batch computes to under a third of a cent.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved, SLA calculator and status modes all ran through the server. The real two-document batch ran through the server: 0 failed, 100% of fields, $0.0002. It is not the default, because of the wait.

## Takeaways

1. Ask who is waiting. A person blocked on the result rules out batches, whatever they save.
2. Check `stop_reason`, not only `result.type`: "succeeded" includes replies cut off at `max_tokens`.
3. An invalid request can enter a batch and fail later, alone. Validate requests yourself before a large submission, as you may only find out after hours.
4. Never read results by position. They arrived out of order every time here.
5. Retry only what failed, with a change aimed at the failure. Here 2 of 20 went back.
6. Score the sample and the rest separately. A prompt tuned on five documents showed 100% there and less elsewhere.
7. A 30-hour SLA minus a 24-hour window assumes the batch succeeds. Plan for expiry too, if the deadline is real.
8. Save the batch ID before you wait, so interruption costs nothing.
