# Tool hooks

Run your own code around every tool call: before it to refuse the call, after it to rewrite what the model reads.

## Use when

- Several tools return the same kind of data in different formats, and you cannot change them all
- A rule must hold across many tools, or for tools you do not own, such as MCP servers
- You use the Agent SDK or Claude Code, where the tool loop is not your own code

## Do not use when

- You own the tool loop and only one handler needs the rule; check inside the handler, as in [deterministic gates](deterministic-gates.md)
- The rule is a preference about style or tone; a prompt is enough
- You can fix the format once at the source

## Decision

Use the pre-execution hook for anything that must not happen, and the post-execution hook for data cleanup and for recording facts
that later rules depend on. A post hook can never prevent anything, since the tool has already run. Put each decision in a plain
function, so it can be tested with no model. Keep state per session and per entity. Wrap the hook in a try/catch whose catch
branch denies.

## Trap

**A pre-execution hook that throws does not block.** The call goes ahead and the model reports success, with nothing to indicate
the failure. Other quiet failures: the tool name in a hook carries a server prefix, such as `mcp__bank__process_refund`, so a
bare-name rule never matches; a normaliser that passes unknown values through makes them look clean; and a hook log does not
prove what the model saw.

## Example

[hooks.js](../examples/05-agent-sdk-hooks/hooks.js): both hook directions, and the decisions as plain functions.
[step-6-broken-hook.js](../examples/05-agent-sdk-hooks/step-6-broken-hook.js): the fail-open test.
[api-capture.js](../_shared/api-capture.js): how to read what really reached the model.

## Verified

2026-10-31, `claude-haiku-5-5`, `@anthropic-ai/claude-agent-sdk` 0.3.226, `permissionMode: "bypassPermissions"`. API request bodies
held only normalised values. A told-to-misbehave model attempted a 750 refund and transfers without a passing check: the ledger
shows none of them ran, 4 blocks in total, while allowed calls ran. Deny held despite bypass mode, and reached the model as an error
result. A throwing hook let a 750 refund execute.

## Usual advice vs observed

The usual advice calls hooks a deterministic guarantee. That holds for the hook's logic only. If the hook itself crashes, this SDK
continues with the tool call. The guarantee has to include a catch branch that denies. Fail-open was seen in one run, under bypass
mode only.
