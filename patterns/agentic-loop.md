# Agentic loop

Call the model repeatedly, run the tools it asks for, and let its stop signal decide when the work is finished.

## Use when

- The next step depends on what a tool returns, such as look up a value and then calculate with it
- The number of steps cannot be known before the run
- The model should choose between several tools

## Do not use when

- One call gives the answer, with or without one known tool call
- The steps are fixed and known; plain code calling each step is cheaper and easier to test
- An SDK or framework already runs the loop for you; configure its limits instead

## Decision

Keep the message history in your own code and resend it on each request. Branch on `stop_reason` only. On `tool_use`, append the assistant turn unchanged, run every `tool_use` block, send all results in one `user` message, and continue. On `end_turn`, return the text. Treat every other value as unfinished. Return tool failures as results with `is_error: true`. Put an iteration cap inside the loop as a guard, and treat reaching it as a fault: return nothing and warn.

Guidance, not verified by a run here: a tool result is a `tool_result` block in a `user` message, tied to its call by `tool_use_id`, with `content` as a string and not a plain object. The Messages API has no separate role for tools.

## Trap

Branching on the first content block or on the wording of the text works until a response starts differently. A cap written as the loop condition looks fine, and then silently cuts off long runs and returns a partial answer. Reading `tool_use` with `find` drops the second call of a parallel pair, and the next request is rejected. A test of the final text alone can pass on a guessed number, so assert the tool trace as well.

## Example

[agent-loop.js](../examples/01-agentic-loops/agent-loop.js): the loop, with its cap inside. [step-5-chained.js](../examples/01-agentic-loops/step-5-chained.js): dependent calls checked by their trace. [step-6-safety-cap.js](../examples/01-agentic-loops/step-6-safety-cap.js): the cap firing. [loop.js](../_shared/loop.js): a reusable version.

## Verified

2026-11-01, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 0.116, one run per script, about $0.02 in all: 22 of 22 checks. A dependent task took 3 iterations, search and then calculator, and the final answer carried the calculated figure. The same task with a cap of 1 stopped after one iteration and returned null. `max_tokens`, `refusal` and `pause_turn` were not produced for real, so that branch is untested.
