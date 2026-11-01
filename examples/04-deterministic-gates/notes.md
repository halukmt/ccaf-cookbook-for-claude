# 04 Deterministic gates and handoffs: notes

All live runs: 2026-10-31. Models: `claude-sonnet-5-5`, plus `claude-haiku-5-5` for the forced attempt.

## Step 1 — A support agent with three tools and shared mock data

Built: `get_customer`, `lookup_order`, `process_refund`, plus shared mock data.
Files: [support-agent.js](support-agent.js), [../../_fixtures/support.js](../../_fixtures/support.js)
Executed: yes, through steps 3 and 5.

## Step 2 — The gate compares IDs: one verified customer does not unlock another

Built: A session object holds verified customer IDs; `process_refund` checks the ID it was asked to refund.
Files: [support-agent.js](support-agent.js), [step-2-gate.js](step-2-gate.js)
Executed: yes, 7 of 7 checks, no API cost. Covered: blocked before verification, allowed after, another
customer stays blocked, an unverified customer stays blocked, an ambiguous name verifies nobody, no leak
between sessions.
Design choice: A version that stores one verified ID and refunds that ID ignores the requested customer: a
request for customer B after verifying customer A would silently refund A. This version keeps a
set and compares IDs. Blocked calls also return `is_error: true`, not just a text string.
Pitfall: A single "someone was verified" flag is not the same as "this customer was verified".

## Step 3 — A well-behaved model never trips the gate, so force the bad call

Built: A live test with an urgent request that supplies the customer ID.
Files: [step-3-bypass.js](step-3-bypass.js)
Executed: yes, twice.
- Unforced, on Sonnet 5.5: the model verified first on its own, so the gate never fired. A "model
  skips, gate blocks" sequence did not occur.
- Forced first call, on Haiku 5.5: `process_refund [BLOCKED] -> lookup_order -> get_customer -> process_refund`.
  4 of 4 checks. The model recovered by itself from the error text.
Design choices:
- The prompt includes the customer ID, because without one the model cannot attempt a refund at all.
- The first turn is forced, because a well-behaved model does not reliably produce the failure.
- A final check of `verifiedCustomerId === null` is false after a successful retry, so it cannot
  show that the gate worked. The checks look at the actual tool sequence instead.
- Forced `tool_choice` returned a 400 on `claude-sonnet-5-5`, so this step uses Haiku 5.5.
Pitfall: A passing happy-path run says nothing about a gate. Force the failure, or test the gate without a model.

Forced `tool_choice` by model, tested live:

| Accepted | Rejected with 400 |
|---|---|
| `claude-haiku-5-5`, `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1` |

## Step 4 — A handoff that code checks for completeness

Built: `escalate_to_human` with five fields, and a code check that rejects empty or placeholder fields.
Files: [support-agent.js](support-agent.js)
Executed: yes, through step 5.
Design choice: `refund_amount` is required but nullable, so "no refund" is an explicit statement
and not a missing field. Completeness is enforced by the tool handler as well as the schema.
Pitfall: The human sees only this handoff. Anything left out means asking the customer again.

## Step 5 — Three concerns, one handoff, and a limit of the gate

Built: A live test with a return, a billing dispute and an address change.
Files: [step-5-handoff.js](step-5-handoff.js)
Executed: yes, 6 of 6 checks. The handoff named all three concerns with specifics.
Design choice: The prompt adds the customer's name and email, because the agent needs them to
identify the customer. The check looks in both the summary and the action, with alternatives for wording.
Finding: The agent refunded 45 for the return before the item came back, and noticed that the disputed 45 might
be the same charge, flagging a possible double refund. The gate proves identity only. It does not prove that
the refund is owed or that the order belongs to this customer.

## Takeaways

1. If a mistake costs money, breaks security or breaks compliance, put the rule in code. A prompt rule is fine
   for tone and formatting.
2. Test a gate by forcing the bad call. Sonnet 5.5 never produced it unforced in this run.
3. Gates answer one precise question. This gate answers "is this customer verified?", not "is this refund owed?".
   Each business rule that must always hold needs its own gate.
4. A handoff must make sense to someone who saw nothing else. Validate it in code.
5. Do not design on forced `tool_choice` without checking the model: the newest Sonnet, Opus and Fable reject it.
