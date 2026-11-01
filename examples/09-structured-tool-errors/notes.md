# 09 Structured tool errors: notes

All runs: 2026-10-31, `@modelcontextprotocol/sdk` 1.30.0. Agent runs: `claude-haiku-5-5`, one run per scenario, 9458 input and 1712
output tokens in total.
The server's result messages and the tool descriptions were reworded after these runs, with the same meaning, and not re-run.

## Step 1: A stdio server that fails on demand

Built: A stdio MCP server with `customer_lookup`, started as a real child process, over the shared mock customers.
Files: [customer-db-server.js](customer-db-server.js), [mcp-connection.js](mcp-connection.js), [step-1-4-responses.js](step-1-4-responses.js)
Executed: yes, step-1-4 script 28 of 28 checks, no API cost.
Uses `registerTool` instead of the deprecated `tool`. `mode` includes `crash`, for a failure nobody structured. IDs follow the fixture,
`C-NNNN`.

## Step 2: Four error categories, each with its own reaction

Files: [customer-db-server.js](customer-db-server.js)
Executed: yes. Each mode returned the expected category and `isRetryable`.
`invalid` also fires for real when an identifier has a bad format, in success mode, so the model can run
into it without a planted failure. The business error (a refund limit, from a lookup tool) is an illustration only, as
a real lookup could not hit a refund limit. Amounts carry no currency symbol.

## Step 3: Every error carries the same three fields

Executed: yes. Each error parses to exactly `errorCategory`, `isRetryable`, `description`. All go through `buildErrorResponse`.
Plain JavaScript, as TypeScript annotations do not run in plain Node.

## Step 4: An empty result is a success, a timeout is not

Executed: yes. Empty: `isError: false`, `resultCount: 0`, "executed successfully". Timeout: `isError: true`, `transient`, "did not execute".
A real miss in the data produces the same empty shape as the planted mode.
Trap: Returning nothing for both is what makes an agent retry a search that succeeded, or report "no customer" when the database was down.

## Step 5: Code picks the recovery, and retried timeouts stay below the model

Built: `callWithRecovery` decides from metadata; `runRecoveryAgent` runs a real model through it.
Files: [recovery.js](recovery.js), [step-5-recovery.js](step-5-recovery.js), [step-5-agent.js](step-5-agent.js)
Executed: free script 10 of 10 checks, with backoff really waiting (7038 ms for 1 s + 2 s + 4 s). Agent script 13 of 13.
- Empty: 1 server call, model said no match, no retry.
- Two timeouts: 3 server calls by code, while the model made 1 call and never saw an error.
- Retries exhausted: 4 server calls, escalated.
- Bad format: model sent `1001`, read the error, sent `C-1001`, and it worked.
- Business, permission, crash: 1 server call each, then escalated or credentials requested.
- Calls refused after a stop: 0 in all four. The model stopped once told the case was handed over, so that gate never fired in these runs.

Design choices:
- The recovery switch does more than log: it really retries, stops and hands over.
- `mode` is hidden from the model and injected by the harness. If the model could see it, it could choose or avoid a failure.
- A fifth outcome, `unclassified`, covers errors with no valid metadata. Never retried.
- A cap of 2 input fixes, not triggered in these runs, since the model fixed the input on its first try.
- Permission "request credentials" is a recorded request and a handover, as there are no credentials to elevate to here.

## Where the error flags mislead

- `isRetryable: true` on a validation error does not mean "call again". A blind retry on that flag repeats a call that must fail. Only
  `errorCategory` separates "same call later" from "different call now", so recovery must not branch on the flag alone.
- SDK 1.30.0 reports schema-invalid arguments and unknown tools as `isError: true` results, with `MCP error -32602` as plain text, and
  not as a thrown protocol error. Thrown exceptions in a handler likewise become `isError: true` with the raw message. So `isError`
  alone says nothing about structure. Recovery must parse and handle missing metadata.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js): a free raw-response view and one agent scenario per branch. Route and live runs checked.

## Takeaways

1. Use this for any tool whose failures need different reactions. A read-only tool with one failure type does not need four categories.
2. Separate "the query ran and found nothing" from "the query did not run". This one distinction prevents most wasted retries.
3. Retry transient failures in code, below the model. It saves model turns and keeps the backoff honest.
4. Treat missing metadata as "do not retry, hand over". Frameworks and bugs will produce errors you did not structure.
5. Stop in code as well as in words after a terminal error. The model obeyed here, but that was 4 runs on one model.
