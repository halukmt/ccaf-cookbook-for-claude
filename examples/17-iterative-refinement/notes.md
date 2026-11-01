# 17 Iterative refinement: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`. Sandbox: [sandbox/](sandbox/). Blueprint: [../../blueprints/refinement/](../../blueprints/refinement/).
Isolation: [../../_shared/config-lab.js](../../_shared/config-lab.js). Cost, CLI-reported, including superseded runs: about $2.31, of which $1.11 was the failed first design of steps 1 and 2. Free: [step-0-blueprint.js](step-0-blueprint.js), 16 of 16.

## Examples pin down the return type better than prose (steps 1 and 2, three runs each)

Executed: [step-1-2-live.js](step-1-2-live.js), final form 7 of 7, $0.0671. Both arms target `fetchInvoices`, so they compare the same task rather than different functions.

| Arm | Return types across 3 runs | Other variation |
|---|---|---|
| Prose | `Result<Invoice[], Error>`, `Result<Invoice[]>`, `Result<Invoice[], Error>` | each a long, different answer: result module, helpers, call-site advice |
| Examples, through `/transform-by-example` | `Result<Invoice[], ApiError>` three times | a line or two of commentary, differing per run |

Examples gave one return type, on a small sample. Two details: prose did not produce three different types, it produced two. And full texts were not identical with examples either, because the model added commentary despite the "reply with only" instruction. A pipeline must parse, not compare strings. No prose run could have guessed `ApiError`, which is the real gain: examples carry conventions.

**What went wrong first (kept because it will recur).** The first version used the default system prompt with `--tools ""`. The model wrote fake tool calls as text, and two runs produced an empty result at **$0.50 each**, burning output far beyond the `--max-budget-usd 0.1` cap; the cap only applies between calls. Total for that attempt: $1.11, and the script failed. Then `CLAUDE_CODE_MAX_OUTPUT_TOKENS=800` cut the long prose answers: the CLI continued after the limit, and the `result` field held only the final fragment beginning `...`, so the parser found no signature. A third version's checks passed with `null` signatures until I added a check for that. Final form: a short `--system-prompt`, an output cap of 4000, and a check that every signature could be read. That also lowered a run to about $0.005.

## Test-driven iteration depends on the failure text (step 3)

Built: [test-feedback-loop.js](../../blueprints/refinement/scripts/test-feedback-loop.js). Tested with a scripted model and, for its command-line wrapper, a real CLI against the stub.
Executed: [step-3-live.js](step-3-live.js), final form 6 of 6, $0.1309, starting from a one-sentence spec, with the 11-test suite out of reach and failures sent through `--resume`.
**Rounds: 8 failing → 1 → 0.**
The tests are not shared up front, since that leaves a capable model nothing to iterate on.
**First attempt stalled at 8 → 3 → 3 → 3, $0.2195, and that was my bug.** A failed `assert.throws` reports its message as a YAML block (`error: |-`), and the first parser kept only that line. The model was told a test failed but not why, and it could not fix the error message wording. Once the feedback carried the expected text, it was solved in one round. Measured: the technique's value is the content of the failure message.

## An interview surfaces what a direct request skips (step 4)

Executed: [step-4-live.js](step-4-live.js), 9 of 9, $0.1123.
With `/interview-first`: 10 question lines covering invalidation, consistency, failure, TTL, keys, security and scale, and no code. Answers through `--resume` were all used: `DEFAULT_TTL_MS = 90_000`, fail-open and per-user separation.
Control, asked to implement directly: code at once, with a 60-second TTL it chose itself. Topics seen in its text: only TTL, keys and scale. Topic counts come from regexes over the text, so treat them as indicative.
Limits: under `-p` the questions end the run, so the answers go in a second, resumed call. Under `dontAsk` `AskUserQuestion` is refused even when in `--allowedTools`, from `step-0`. **Not executed:** interactive question dialogs.

## Interacting fixes break across separate sessions (step 5)

Executed: [step-5-live.js](step-5-live.js), 3 of 3, $0.4461. The score comes from running the code: a route's failure goes through the logger and into the client.

| Setup | Cost | Tool calls | Responses | Logger | Client class | Types |
|---|---|---|---|---|---|---|
| Batch, `/batch-fixes` | $0.1268 | 15 | yes | yes | yes | yes |
| Sequential, one resumed session | $0.1584 | 16 | yes | yes | yes | yes |
| Three separate sessions | $0.1609 | 24 | yes | yes | **no** | yes |

**You might expect sequential fixes to conflict.** In one resumed session they did not; the session remembered the shape. The failure appeared with separate sessions, where the third updated the `.d.ts` but left `client.js` not exposing `errorCode`, so **the types promise a field that is undefined at runtime**. One run each. The issue text only names the types in that step, so it is fair to call this a specification gap that batching happened to cover. Batch was also cheapest here.

## Takeaways

- Inconsistent interpretation: show 2 or 3 examples, and let them carry your conventions.
- Complex behaviour: tests, and make sure the failure text reaches the model in full. A loop that loses the message looks like a model that cannot learn.
- Unknown domain: interview first. Under `-p` that takes two calls.
- Interacting changes: one message or one session. Never independent sessions.
- Never run `--tools ""` with the default system prompt; pass a short one, and set an output cap. A budget flag does not stop a single runaway response.
