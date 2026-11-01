# Deterministic gates

Make a risky tool refuse to run in code until its preconditions hold, whatever the model decides.

## Use when

- A tool moves money, changes access, deletes data or sends something outward
- A wrong call has a real cost even if it happens rarely
- A step must always precede another, such as identity check before refund

## Do not use when

- The rule concerns tone, format or preference; a prompt instruction is enough
- A human already approves each action at the point of execution
- The cost of a rare miss is low and easy to undo

## Decision

Keep the precondition state per session in your own code, and check it inside the tool handler. On failure, return
an error result that says what is missing, so the model can recover by itself. Compare the specific entity, such as
this customer ID, and not a general "something was verified" flag.

## Trap

A gate looks fine when the model behaves. Happy-path runs may never reach it, so test by calling the handler directly
and by forcing the bad call. Also, a gate answers only its own question: identity verification does not prove that
a refund is owed. Add one gate per rule that must always hold.

## Example

[support-agent.js](../examples/04-deterministic-gates/support-agent.js): the check in the
`process_refund` branch. [step-2-gate.js](../examples/04-deterministic-gates/step-2-gate.js)
tests it with no model involved.

## Verified

2026-10-31, `claude-sonnet-5-5` and `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116: 7 of 7 direct checks passed. A forced
early refund was blocked, and the model then verified the customer and retried successfully.

## Usual advice vs observed

The usual explanation has the model skipping verification and being stopped. In one unforced Sonnet 5.5 run it verified by
itself, so the gate never fired. The gate still earns its place, but it has to be tested with a forced failure. Forcing
through `tool_choice` needs a model that accepts it: Sonnet 5.5, Opus 5.5 and Fable 5.1 return a 400.
