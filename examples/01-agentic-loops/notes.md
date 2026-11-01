# 01 Agentic loops: notes

## Step 1 — The model asks, the caller runs: two tools, one request

Built: Two tool definitions (calculator, web_search) with JSON Schema `input_schema`, their local
implementations kept in a separate export, and an Anthropic client. One single API call proves
registration — no loop yet.

Files: `client.js`, `tools.js`, `step-1-setup.js`

Design choice: the descriptions run 3–4 sentences with examples and boundary statements
("Do NOT use for X — use Y for that"). A single sentence would also register, but the longer form is
the production-quality one. Per-property `description` fields inside `properties` are optional in
JSON Schema and included here.

Pitfall: The model never executes a tool. It emits a `tool_use` block and stops; running the tool
is the caller's job. Second pitfall: the tool description *is* the selection mechanism — on misrouting,
sharpen the description before adding a routing layer or classifier.

## Step 2 — `stop_reason` drives the loop

Built: `while (true)` loop around `client.messages.create()`, branching solely on
`response.stop_reason`. Both branches left as stubs (step 3 / step 4). Third branch logs any
unhandled `stop_reason` instead of falling through silently. Two prompts run through the same loop
so both `tool_use` and `end_turn` fire.

Files: `step-2-loop.js`

Note: `tool_use` should lead to `continue`. This step's stub breaks with a TODO instead, and step 3
replaces it with `continue`. `messages` is `const` because the array is mutated, not rebound.

Pitfall: **Never check `content[0].type`.** The prohibition targets content type as the *loop
control signal*. Checking `block.type` to *extract* the tool call, after `stop_reason` already
decided, is correct and unavoidable in step 3. Rule of thumb: **`stop_reason` decides, `content`
delivers.** Never the other way round.
Second pitfall: an iteration cap as the *primary* stop is wrong, but as a *safety net* it is fine —
step 6 adds one deliberately.
Third pitfall: the API is stateless. The caller owns the conversation history and must resend it in
full on every request.

## Step 3 — Answering every tool call in one user message

Built: Real `tool_use` branch — push the assistant turn verbatim, execute every `tool_use` block,
collect all `tool_result` blocks into one `user` message, then `continue`. Tool exceptions are
caught and returned with `is_error: true`.

Files: `agent-loop.js` (replaces the `step-2-loop.js` skeleton from here on)

Design choice: `filter`, not `find`, for `tool_use` blocks, because unanswered `tool_use` blocks are
rejected by the API.

Pitfall: **Both** messages must be appended. Pushing only the `tool_result` and dropping the
assistant turn is an API error — the `tool_use_id` would reference a block the API never saw.
Second pitfall: tool results carry the **`user`** role. There is no "tool" role in the Messages API.
Third pitfall: `tool_result.content` must be a **string** (or a content-block array), never a raw
object.
Fourth pitfall: a tool execution failure belongs in the result with `is_error: true` — not as a thrown
exception and not as a JSON-RPC protocol error.

## Step 4 — Only `end_turn` means done, and block order is not stable

Built: `end_turn` branch pushes the closing assistant turn, extracts every `text` block via
`extractText()` and returns the joined string. Unhandled stop reasons log loudly and return `null`.

Files: `agent-loop.js`

Design choice: pushing the final assistant turn into history is unnecessary for a one-shot answer
and required for resumable conversations (example 07). With no text block, the `join` yields `""`.

Empirical finding: across two runs of the *same* prompt, the assistant turn came back as
`[tool_use]` once and as `[thinking, tool_use]` the next time. Had the loop branched on
`content[0].type` it would have seen `thinking` and taken the wrong path; `stop_reason` said
`tool_use` in both runs. This is the concrete reason behind "never check `content[0].type`" —
block structure is not guaranteed, `stop_reason` is.

Pitfall: only `end_turn` means done. `max_tokens` (answer truncated mid-sentence) and `refusal`
must not be treated as success.
Second pitfall: there is no `response.text`. The answer lives in the content blocks.

## Step 5 — A chained task: the model reads a figure and calculates with it

Built: No new loop code. A prompt that cannot be answered in one pass ("look up the population of
Germany, then calculate 12 % of it"), plus an iteration/tool-call counter and an assertion that the
calculated figure actually reaches the final answer. `agent-loop.js` became a pure library — the
top-level demo call was removed.

Files: `step-5-chained.js`, `agent-loop.js`

Result: 3 iterations, 2 tool calls. `web_search` → `83,500,000` from the snippet → `calculator`
with `83500000 * 0.12` → `10,020,000`. The number appears nowhere in the code; the model read it
out of the returned prose. The model also sharpened the query to "population of Germany 2024" on
its own.

Pitfall: iteration count is not predictable — the same task may take two rounds or five,
depending on how the model decomposes it. No fixed counter can drive the loop; only `stop_reason`
knows when it is done. A cap of 2 here would have destroyed the answer.
Second pitfall: these two calls were sequential *because of the data dependency*. Independent tools
can arrive as several `tool_use` blocks in ONE response — which is why step 3 uses `filter`, not
`find`. With `find`, the second call would go unanswered and the API would reject the next request.

## Step 6 — The iteration cap is a guard rail, not the stop condition

Built: `MAX_ITERATIONS = 20`, kept as a guard rail *inside* `while (true)` rather than as the loop
condition, so the code itself shows that `stop_reason` is the mechanism and the cap is the net.
Firing it logs a warning and returns `null` — never a partial result. Demonstrated with the same
task twice: cap 20 (ends at 3 iterations via `end_turn`) and cap 1 (guard fires, no answer).

Files: `agent-loop.js`, `step-6-safety-cap.js`

Design choice: the guard is the first statement in the body. Writing `while (iteration < max)` instead
would make the cap read as the mechanism.

Pitfall: the cap as a *fallback* is correct; the cap as the *primary stopping mechanism* is the
anti-pattern. **The cap prevents damage, it does not end work.**
Second pitfall: an aborted run must not return a plausible-looking partial result. Reporting an empty
result as success is the same mistake.

## Viewer

`ui.html` + `viewer.js`, served by the central server at the repo root. `npm start`, then
http://localhost:4111 → example 01. Server-Sent Events push each loop event to the browser as it happens.
The API key stays server-side; that is why this is a server and not a standalone HTML file.
`runAgent` gained an optional `onEvent` listener for it — console output is unchanged, so every
step script still runs the same.

The page shows `stop_reason` as the badge per iteration and prints the content block types under
it, which makes the "never branch on `content[0].type`" argument visible: run the same prompt twice
and the block list changes while the badge does not. The safety cap is editable so the guard rail
can be forced to fire.

## 2026-11-01 — Rework on the direct API

The sections above describe the first build. It ran through a former API provider, so their figures are history, and block
shapes such as the `[thinking, tool_use]` observation were not re-measured.

Ran: every step script's final form, once each, one after another, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 0.116, direct key.

| Script | Checks | Computed cost |
|---|---|---|
| `step-1-setup.js` | 8 of 8 | $0.0018 |
| `step-2-loop.js` | 3 of 3 | not printed, about $0.003 |
| `step-5-chained.js` | 6 of 6: 3 iterations, search then calculator, 10,020,000 | $0.0064 |
| `step-6-safety-cap.js` | 5 of 5: cap 20 ended in 3 iterations, cap 1 returned null | $0.0083 |

Costs are computed from real tokens at the documented list price, not billed amounts. Total about $0.02.

Changed: every step script now checks its claim with `_shared/check.js` and exits non-zero on failure. Before, step 5 printed
"NO" and step 6 printed its result, both with exit 0. `agent-loop.js` adds up token usage and reports it on the `done` event. The
loop itself did not change.

Viewer: the page returned 200, and one live run through the server ("Say hello in exactly one word.") gave `start, iteration,
answer, done, runSaved`, about $0.001. The saved run from 2026-10-31 shows the two-tool path through the page.

Not verified: `max_tokens`, `refusal` and `pause_turn` were never produced for real, so that branch has only been read, not run.
A tool that throws was not forced during a live run either; the calculator's refusal was tested directly.

## Takeaways

1. Use a loop only when the next step depends on a tool result. If one call is enough, no loop is needed.
2. Let `stop_reason` drive the loop. Do not branch on the first content block or on the wording of the text.
3. Treat anything other than `end_turn` as not finished. Return nothing rather than a cut-off answer that looks complete.
4. Keep an iteration cap, and treat reaching it as a fault to investigate. Choose it well above normal runs: here 3 iterations against a cap of 20.
5. Answer every `tool_use` block, in one message, with failures as `is_error` results, so the model can react and the next request is not rejected.
6. In tests, assert on the tool trace as well as on the final text. A plausible answer does not prove that the tools ran in the right order.
