# 25 Context window management: notes

All live runs: 2026-10-31, `claude-sonnet-5-5`, plus `claude-haiku-5-5` for step 5, sequential. Saved: [results/](results/). Scripts re-read them unless `--force` is passed.
Cost: $0.206 for the saved conversation, computed from 55,765 input and 9,467 output tokens at list price. $0.005 for step 5, $0.003 for the viewer check. A first conversation run crashed on an empty summary and saved nothing; its cost, roughly $0.10, is an estimate since it was never recorded. Total about $0.31.
The hand-written lossy summary and the key findings section headers were reworded after those runs, with the same meaning. [results/](results/) holds the wording that was actually sent.

**Short version:** concise model-written summaries kept every exact value through three rounds. They did not show the trap at all. A 40-word limit did: its last summary held 6 of 13 values. The block fixed this. The agent also often repaired the loss itself, by looking the orders up again, which only works for lookup data. One run per arm, so this is one observation each, not a rate.

## Step 1 — Extract case facts before trimming

Files: [case-facts.js](case-facts.js), [order-data.js](order-data.js), [step-1-2-offline.js](step-1-2-offline.js)
Executed: 14 of 14 checks across steps 1 and 2, no API cost.
The field is called `orderTotal` and not `refundAmount`, because an order total and a refund differ here ($247.83 vs $235.33 after a fee). Return fields and `mergeCaseFacts` exist so that a later tool result adds to the block and does not overwrite it.
Trap: extraction order. The trim list has neither `customer_id` nor `status`, so extracting after trimming loses both silently. Extract from the raw result, then trim. A check proves this.

## Step 2 — Keep the facts in a block above the summary

Files: [case-facts.js](case-facts.js)
`buildPrompt(null, ...)` leaves the block out, since interpolating null would print the word `null` under the header. `recentTurns` keeps everything between the summary and the current message, which would otherwise be dropped.
The block joined the prompt at the first summary, not on turns 1 to 4, because those turns are one shared run so the arms start identical.

## Step 3 — Trimming saves less than one result suggests

Files: [step-3-trim.js](step-3-trim.js)
Executed: 5 of 5 checks, using the token counting endpoint, which is not billed.
Real result: 46 fields to 5, **788 to 57 tokens, 92.8% smaller**, for one result. A rough guess would be about 2000 to 200. An expected saving of 80 to 90% holds, a bit better, for the mock I wrote, so its size is my choice and not evidence.
The whole final request of the ten-turn conversation shrank by **38.0%** (3,843 to 2,381 tokens) as it also has the system prompt, tool definitions and chat. Quote the request figure, not the per-result one, when estimating savings.
The return result gets its own field list, `RETURN_FIELDS`.

## Step 4 — Losses appear with a word limit, and the block prevents them

Files: [conversation.js](conversation.js), [step-4-conversation.js](step-4-conversation.js), [results/conversation.json](results/conversation.json)
Executed: 14 of 14 checks. Four shared turns, then five branches to turn 10. The tools stayed available throughout. 13 known values are compared by pattern with the final answer.

| Arm | Values in final answer | Lost | Orders looked up again |
|---|---|---|---|
| Full history, no summary | 11 of 13 | customer ID, status | 0 |
| One concise summary after turn 4 | 11 of 13 | customer ID, status | 2 |
| Concise summaries after turns 4, 6, 8 | 11 of 13 | customer ID, status | 2 |
| 40-word summaries after turns 4, 6, 8 | 10 of 13 | customer ID, status, restocking fee | 2 |
| 40-word summaries plus block | 13 of 13 | none | 0 |

What the table shows:
- **The expectation "without the block, specifics are lost" did not hold for an honest summary.** With the instruction "be concise", the summary kept the amounts, dates and references. The loss appeared with a word limit: 6 of 13 values remained, without the totals, dates or fee.
- **Summary loss and answer loss differ.** The 40-word arm had dropped 7 values, but its answer was missing only one more than the control, since the agent looked both orders up again. The return's restocking fee has no such lookup, and the agent said so plainly: "I don't have a restocking fee figure".
- **The first two losses come from trimming, not summarising.** Customer ID and status are removed by the trim list, so even full history has neither. Only the block has them. A trim list is itself a decision about what the agent may ever know.
- **The block does not cover what a customer said.** The card ending 4417 never appears in a tool result, so the extractor cannot capture it. It survived in the summaries, but only because they kept it.
- No arm invented a dollar amount, and the agent admitted what it lacked each time. A lost value here looked like "I don't have that", not like a wrong figure.
- A hand-written lossy summary is run as a **forced** case: without a block the agent asked for the order number, with it the agent confirmed all three values. It shows only what its author removed.

All other summaries are written by the model, for that same reason. The scorer needed one fix after reading a real answer: a bare `12.50` matched "It is $12.50 less than the order total" in an answer stating it had no fee figure. The pattern now requires the word "restocking" nearby.
Surprise: `max_tokens: 500` gave an empty summary once, in the first run. It was raised to 1500 with stop reason and block types in the error. The cause was not diagnosed, since it did not recur.

## Step 5 — Key findings first made no measurable difference

Files: [step-5-key-findings.js](step-5-key-findings.js), [results/key-findings.json](results/key-findings.json)
Executed: 7 of 7 checks. 80 reports, about 21,000 input tokens, Haiku 5.5, one run per arm.
Result: **both arms found 5 of 5**, including the recalls at positions 39, 40 and 41. That includes the one the summary flagged as routine. So lost-in-the-middle **was not observed** at this size with this model. The key findings shape works mechanically, but this run gives no evidence of benefit. It cost 1,900 more input tokens. A larger input or weaker model might differ; that was not tested.
This single cheap pair exists so that the claim is tested rather than repeated.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Saved results are the default. Checked: route 200, a saved run with 15 events, one live run at $0.0025 that confirmed both values.

## Takeaways

1. Keep exact values for an agent acting on them in a block built by code from tool results. It does not depend on how a summariser behaves on a given day.
2. The danger grows with compression. Test your real summary prompt against known values before deciding you have this problem.
3. Extract before trimming, and include the customer ID and status in one of the two lists.
4. Add anything agreed in conversation by a separate path. A tool-result extractor cannot see it.
5. A lookup can repair lost facts at a small cost, and only for data with a lookup. The risk sits in action results, such as a return reference and fee.
6. Report trimming savings against the whole request, not one result: 92.8% vs 38.0% here.
