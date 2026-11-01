# 05 Agent SDK hooks: notes

All live runs: 2026-10-31. Model `claude-haiku-5-5` (no custom subagents here, so the cheapest model does the job).
`@anthropic-ai/claude-agent-sdk` 0.3.226. Total live cost: about $0.16 ($0.031 + $0.076 + $0.013 + $0.023 viewer, plus a short viewer recheck after a small edit).

Environment: the hooks are SDK callbacks with the `hookSpecificOutput` format, the tools are an in-process MCP server, and `zod`
comes from the SDK's peer dependency. The child runs with `_shared/agent-env.js` (temporary `CLAUDE_CONFIG_DIR`, no persisted session).

## Step 1 — Three tools that disagree on date and status formats

Built: `get_customer` (epoch, numeric), `get_order` (ISO, word), `get_shipment` (DD/MM/YYYY, letter), plus `process_refund`,
`aml_check`, `transfer_funds`. Every handler writes to a ledger.
Files: [tools.js](tools.js), [../../_fixtures/mixed-formats.js](../../_fixtures/mixed-formats.js), [step-1-tools.js](step-1-tools.js)
Executed: yes, 5 of 5 checks, no API cost.
Design choice: the data sits in a fixture, with a second customer and shipment for negative cases.

## Step 2 — Normalising to one format, and marking what cannot be read

Built: `normaliseDate`, `normaliseStatus`, `normaliseRecord`, and a hook that returns `updatedToolOutput`.
Files: [hooks.js](hooks.js), [step-2-normalise.js](step-2-normalise.js)
Executed: yes, 14 of 14 checks, no API cost.
Design choices, each for a reason:
- ISO input is also rewritten through `toISOString()`. Otherwise `...12:00:00Z` sits next to `...00:00.000Z`, which is
  two formats, not one.
- Dates are parsed with a round-trip check. Otherwise `31/02/2024` and `03/13/2024` become wrong dates or throw.
- An unmapped status or unreadable date becomes `unknown` plus `normalisation_problems` with the raw value. Passed
  through unchanged, a raw `500` would look normalised.
- The hook receives wrapped MCP content, not a plain record: observed `tool_response` is an array of content blocks, so
  it is parsed first and the replacement has the same shape.
Pitfall: Shape detection assumes every slash date is DD/MM. `02/04/2024` from a US system would be silently wrong. Only an
impossible date is caught. If the source is known, key the format on the tool instead.

## Step 3 — Proving at the API request what the model really received

Built: a live run plus `_shared/api-capture.js`, a local proxy that records the real API requests.
Files: [agent.js](agent.js), [step-3-live.js](step-3-live.js), [../../_shared/api-capture.js](../../_shared/api-capture.js)
Executed: yes, 10 of 10 checks, $0.031. The request bodies held only normalised values and no raw epoch, slash date or code.
Design choices:
- Checked at the API request rather than from hook logs. A log proves the hook returned something, not that the SDK used it.
- Easy to get wrong: the epoch `1710489600` is `2024-03-15T08:00:00.000Z`, not `12:00:00`.
- An `includes("T")` check would pass on any string with a capital T, so the check is a full-format regex.
Finding: Without being asked, Haiku noted that the order record has no customer ID, so it could not confirm ORD-42 belongs
to C-001. Normalising formats does not repair missing data.

## Step 4 — A PreToolUse deny keeps the refund from running

Built: `refundDecision`, returning `permissionDecision: "deny"` with the reason. The hook itself files the escalation.
Files: [hooks.js](hooks.js), [harness.js](harness.js), [step-4-refund-hook.js](step-4-refund-hook.js)
Executed: yes, 12 of 12 checks, no API cost.
Design choices: uses the SDK deny format, not a custom `{ blocked: true }`. Reference numbers count up rather than
use `Date.now()`, and a retry reuses the same escalation. A non-numeric amount is refused: `"lots" > 500` is
false, so a plain comparison would allow it.
Pitfall: The limit is per call. Two refunds of 400 both pass, and a check documents this. A per-customer total needs its own rule.

## Step 5 — The AML prerequisite belongs to one customer, not the whole process

Built: `transferDecision`, plus recording in PostToolUse.
Files: [hooks.js](hooks.js), [step-5-aml-hook.js](step-5-aml-hook.js)
Executed: yes, 10 of 10 checks, no API cost.
Design choice: a per-customer set inside a session object rather than one global `passed` flag, and `transfer_funds` takes
`customer_id` so the gate can compare it. Otherwise one customer's pass unlocks everyone.
Tool names in hooks are `mcp__bank__*`, not the bare names.

## Step 6 — A hook that throws fails open

Built: negative and positive cases in steps 4 and 5, through real callbacks, and two more live runs.
Files: [step-6-live.js](step-6-live.js), [step-6-broken-hook.js](step-6-broken-hook.js)
Executed:
- `step-6-live.js`: 14 of 14 checks, $0.076. The model was told to attempt the forbidden calls. Ledger: refund 200,
  AML C-001, transfer C-001, AML C-002. The 750 refund and the C-002 transfer never ran. 4 blocks.
- `step-6-broken-hook.js`: 3 of 3 checks, $0.013. **A PreToolUse hook that throws fails open:** the 750 refund executed, and
  the model reported success with no sign of the error.
Design choices: `callTool` is a real no-model harness. The prompt explicitly tells the model to attempt
refused calls, because a well-behaved model might avoid them and the hooks would never fire.
Also observed:
- A deny holds under `permissionMode: "bypassPermissions"`.
- A deny reaches the model as a tool result with `is_error: true` carrying the hook's reason.
- The model did not bypass or argue with a block; it reported the C-002 refusal and stopped after one retry as told.
- The real `preToolUse` wraps its decision in try/catch and refuses on any error, because of the fail-open result.
Limit of the test: the fail-open result was observed once under `bypassPermissions`, the mode used in this repo. It was
not tested under other permission modes.

## Viewer

[ui.html](ui.html) and [viewer.js](viewer.js). Page returned 200. One run ("Refund over the limit" preset, $0.023) streamed hook
decisions, the captured wire data, the ledger and the invariants. Knobs: hooks on/off and the refund limit. The hooks-off
option was built but not run live, so it has not been observed; the page says what it is for and its invariant checks
should show the failure.

## Takeaways

1. Direction is the whole decision. Only PreToolUse can stop an action. PostToolUse is for rewriting what the model reads,
   and recording facts for later rules.
2. A hook that throws lets the call through in this SDK. A policy hook without its own try/catch is a gate that opens when it
   has a bug. Test this explicitly, and always make the catch branch deny.
3. Keep the decisions in plain functions and test them with no model. All the edge cases here cost nothing to check.
4. Verify on the wire. Only the API request proves what the model really saw.
5. Prove "did not execute" with a ledger in the tool, never from the model's report or the hook log.
6. Normalise to one exact format, and mark what cannot be read. A value quietly passed through looks clean.
7. A gate answers one question. A per-call limit does not limit a total, and shape-based date detection cannot tell DD/MM
   from MM/DD. Decide which of these matter before relying on it.
8. Prompt or hook: if one miss has legal or financial cost, hook. For preferences, a prompt is enough.
