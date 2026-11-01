# 12 Built-in tools: notes

All live runs: 2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`, `--tools Read,Grep,Glob,Edit`, on a temp copy of [../../_fixtures/legacy-orders/](../../_fixtures/legacy-orders/), with a temp
`CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. One script run, $0.1908, 18 turns, 29 s, 22 of 22 checks. The tool calls below come from the CLI's stream, saved in [results/run.json](results/run.json).

Judge first: [step-0-judge-selftest.js](step-0-judge-selftest.js), 7 of 7, no API cost. It shows the checks fail on an empty run, on Read before Grep, on opening an unrelated file, on Write, and on migrating all three refund calls.

Fixture language: JavaScript with `*.test.js`, in place of TypeScript and `*.test.tsx`, so the tests really run.
Prompt choice: the prompt names the tool order and asks for the failing first Edit on purpose. A capable model reads first and would write a wide anchor at once, so an unforced run would probably never show the error. So this
run shows that the sequence works and what the tools report. It does not show that a model picks this order unprompted.

## Step 1: Grep finds the callers before any file is opened

Files: [refactor-lab.js](refactor-lab.js), [step-1-5-refactor.js](step-1-5-refactor.js)
Executed: first call `Grep processLegacyOrder`, before any Read.
Not demonstrated: Glob failing on this search. Only `Glob` for tests was run.

## Step 2: Glob finds the tests, and none needed changing

Executed: second call, `Glob **/*.test.js`. None of the test files reference the legacy function, so none changed. The fixture has no test per caller.

## Step 3: Reads stay incremental, and a migrated wrapper spares its callers

Executed: Read `index.js`, `InvoiceJob.js`, `OrderProcessor.js`, `orderWrapper.js`, `RefundHandler.js`. Unrelated files `shipping.js`, `tax.js` and `emails.js` were never opened.
Noticed: `CheckoutFlow.js` was neither read nor changed. It reaches the legacy function through `submitOrder`, and migrating the wrapper was enough. The prompt told the model this, and the behaviour probe confirms `checkout` now reaches the new API.

## Step 4: Edit migrates each caller, and my prompt had a flaw

Executed: 9 Edit calls, no Write. The model separately edited imports and calls.
Finding: `OrderProcessor.js` and `orderWrapper.js` import from `legacyOrders.js`, which does not export `processOrder`. My prompt's "import from wherever that file already imports from" cannot be followed there. The model switched them to `./orders.js`, said so in its answer, and this was
correct. The flaw is in my prompt. Left as is, as the result is right, and a re-run would prove nothing new.

## Step 5: A non-unique Edit fails with a usable error, and a wider anchor recovers

Executed: the real error, verbatim:
`Found 3 matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.`
Then a wider anchor, `export async function handleRefund(orderId) {\n  const result = await processLegacyOrder(orderId);`, changed exactly one call. `replace_all` changed both calls in `InvoiceJob.js` in one Edit.
Do not expect an error text like `old_string matches 3 locations`. The real wording is the one above, so do not match a guessed text in code.
Not measured: the context saving of Edit over Read plus Write. This run has no such comparison.

## Verification after the run

Files by content: `RefundHandler.js` has 1 call moved, 2 kept; others have no legacy reference; the definition and barrel are unchanged. Running the migrated code: `handleRefund`, both invoice functions, `processIncoming` and `checkout` reach the new API with `validated: true`; `handlePartialRefund` and
`handleChargeback` stay legacy. The fixture's 9 tests pass, though note they pass before migration too, so they prove nothing broke and not that anything migrated. The behaviour probe proves that. The fixture's hash is unchanged. API requests held no private instructions.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js): one button. Route and one live run checked: 14 tool calls, 7 Edits, 1 failed call as intended, all 20 checks passed, $0.1229.

## Takeaways

1. Search contents with Grep, names with Glob. Open a file only once a search gave a reason.
2. A non-unique Edit failure is a safety feature. Widen the anchor to change one place, and use `replace_all` only when every occurrence should change.
3. Grep for the name misses callers behind a wrapper. Either migrate the wrapper or search for the wrapper's name too.
4. Tests that pass before and after a migration do not prove the migration. Check which implementation is really reached.
5. Judge a tool-use claim from the stream of real calls, not from the model's summary, and test the judge on bad runs first.
