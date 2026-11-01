# Structured tool errors

Make each tool failure state its category and retry meaning, and let code choose the recovery from that.

## Use when

- A tool can fail in ways that need different reactions, such as wait, change the input, or involve a person
- A failed lookup could be mistaken for a lookup with no matches
- Retries cost money or load, or a person gets paged on escalation

## Do not use when

- The tool has one failure type and the reaction is always the same
- A short script runs once and a human reads the error

## Decision

Return an error result carrying `errorCategory`, `isRetryable` and a sentence on what to do next, built by one helper. Return no-match
as success, with a count of zero. Retry transient errors in code with capped backoff, feed validation errors back to the model
to correct, and hand everything else over with no retry. Anything that fails to parse is treated as unclassified: never retried, always
handed over.

## Trap

Reading `isRetryable` alone. A validation error is retryable only with different input, and a blind loop on the flag repeats a call that
must fail. Also, an `isError` flag proves nothing about structure: the SDK wraps thrown exceptions, bad arguments and even unknown tools into
`isError` results with plain text, so recovery code that assumes JSON crashes on the errors it most needs to handle.

## Example

[customer-db-server.js](../examples/09-structured-tool-errors/customer-db-server.js): the helper and all response shapes.
[recovery.js](../examples/09-structured-tool-errors/recovery.js): the recovery decision, and an agent running through it.

## Verified

2026-10-31, `claude-haiku-5-5`, MCP SDK 1.30.0 over stdio. Two timeouts: 3 server calls in code, 1 from the model. Endless timeouts: 4 calls,
backoff waited 7 s, then escalation. Empty result: 1 call, no retry. Bad format `1001`: the model corrected to `C-1001` from the error text.
Business, permission and crash: 1 call each, with no retry. One run per case.

## Usual advice vs observed

The common advice is to split recovery first on `isRetryable`. That flag groups "try again later" with "try again differently". The category is
what decides. It is also commonly said that tool failures avoid JSON-RPC errors; in this SDK version, an unknown tool and invalid arguments
also arrive as `isError` results, with the protocol code buried in the text.
