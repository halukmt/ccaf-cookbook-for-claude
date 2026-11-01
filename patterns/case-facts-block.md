# Case facts block

Keep exact values in a block built by code from tool results, resend it with every request, and trim tool output before it joins the history.

## Use when

- An agent acts on amounts, dates or references across a conversation long enough to be summarised
- Tool results are large compared with what the task needs
- Losing or altering one value would cost money or trust

## Do not use when

- Conversations are short and are never compacted
- Exact values can be fetched again cheaply and nothing depends on results of earlier actions
- Answers are general guidance with no record behind them

## Decision

Extract from the raw tool result first, merging by order or case ID. Then trim the result to what the task needs and put only that in the history. Rebuild each request as: block, summary, turns since the summary, current message. Copy values without reformatting. Record what the user states or agrees by a separate path, since a tool-result extractor never sees it.

## Trap

Trimming first silently removes fields the extractor needs, and an agent can never recover what its trim list hides. The other trap is the reverse of the usual story: a concise summary may keep everything, so a test with one summary prompt can say the block is unnecessary, until someone adds a length limit. Summary loss can also stay hidden, as the agent looks orders up again, which covers lookups and not action results such as a return reference or fee.

## Example

[case-facts.js](../examples/25-context-window/case-facts.js): extraction, merging, prompt shape, trimming.
[step-4-conversation.js](../examples/25-context-window/step-4-conversation.js): the comparison, checked against known values.

## Verified

2026-10-31, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 0.116, one real ten-turn run per arm. Final answers held 11 of 13 known values with full history, 11 of 13 after three concise summaries, 10 of 13 after three 40-word summaries, 13 of 13 after three 40-word summaries with the block. The last 40-word summary alone held 6 of 13. Trimming one result: 788 to 57 tokens, 92.8%. Whole last request: 3,843 to 2,381 tokens, 38.0%, from the token counting endpoint. On `claude-haiku-5-5`, flat input and key-findings-first both found 5 of 5 items in 80 reports, with middle positions included, one run per arm, so no benefit from placement was observed at about 21,000 tokens.

## Usual advice vs observed

The usual claim is that summaries destroy exact values. Here, that depended on the instruction: "be concise" kept them all across three rounds, and only a word limit lost them. Nothing was invented in any arm; the agent said what it no longer had. The two values lost even under full history were lost to the trim list, not to any summary.
