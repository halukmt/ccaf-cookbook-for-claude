# Self-contained handoff

When an agent passes a case to a person, send a complete structured summary, validated in code.

## Use when

- Agents escalate to people who cannot see the conversation
- One request can raise several separate concerns

## Do not use when

- The human reads the live conversation and takes over in place

## Decision

Give the escalation tool required fields: who, what happened, likely cause, amount and next action. Make "does not apply"
explicit with `null` rather than an omitted field. Reject empty or placeholder values in the tool handler, so the model
has to fix the handoff before it counts.

## Trap

A schema proves that fields exist, not that they are useful. On multi-concern requests, check that every concern appears:
the failure to look for is a tidy summary of only the first one.

## Example

[support-agent.js](../examples/04-deterministic-gates/support-agent.js): `escalate_to_human` and
`handoffProblems`. [step-5-handoff.js](../examples/04-deterministic-gates/step-5-handoff.js) runs a
request with three concerns.

## Verified

2026-10-31, `claude-sonnet-5-5`: a request with a return, a billing dispute and an address change produced one handoff
covering all three, with 6 of 6 checks passed.
