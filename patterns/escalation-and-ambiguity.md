# Escalation and ambiguous identity

Hand over to a person on a few defined triggers, and make a tool unable to choose between records that match equally.

## Use when

- An agent talks to customers and can act on their accounts
- People ask for a human, or requests fall outside written policy
- A lookup key such as a name can match several records

## Do not use when

- There is no person to hand over to; then design a clear refusal instead
- Lookups use unique keys only, so ambiguity cannot arise
- The agent only answers general questions and holds no customer data

## Decision

Give three triggers in the system prompt, with a worked example for each: an explicit request for a person, a request where policy says nothing, and being unable to progress. State plainly that frustration and self-rated confidence do not count, and include the written policy so that a gap can be told from a "no". Then back the rules that must never break with code. Return no record at all on an ambiguous match, give the search parameters for real identifiers only, and refuse actions unless this customer was matched uniquely and owns the order. A phrase detector in front of the model can catch plain human requests with no model call.

## Trap

Trusting a passing test run. Sonnet 5.5 behaved correctly on every case here, so the code gates never fired by themselves, and only direct handler calls with guessed IDs proved them. Another: a detector misses indirect phrasings, so it must sit in front of the prompt rule, never replace it. And a tool that hands every match to the model turns a privacy rule into a matter of model behaviour.

## Example

[engine.js](../examples/26-escalation-triggers/engine.js): prompt, tool gates, detector.
[step-1-3-offline.js](../examples/26-escalation-triggers/step-1-3-offline.js): the gates tested with no model.
[step-5-absolute-rules.js](../examples/26-escalation-triggers/step-5-absolute-rules.js): phrasings and tempting cases.

## Verified

2026-10-31, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 0.116, one run per case. Prompt only: 7 of 7 scenarios correct, 7 of 7 human request phrasings escalated first with no investigation, 3 of 3 tempting ambiguities with all records exposed got no selection and no leak. An indirect request missed by the detector was escalated by the model. With the gate on, 7 of 7 escalated without a model call. 34 of 34 offline checks passed, including refusal of guessed IDs.

## Usual advice vs observed

It is often said that an agent will investigate before honouring a request, or will pick the likely account. In these runs, with clear criteria and examples, it did neither. Small samples cannot show that this never happens, which is why code remains the guarantee for rules with a real cost.
