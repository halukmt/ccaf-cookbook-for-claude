# 21 Structured output: notes

All live runs: 2026-10-31, sequential. `claude-haiku-5-5` for the `tool_choice` comparison, because `claude-sonnet-5-5`, Opus 5.5 and Fable 5.1 reject forced choice. `claude-sonnet-5-5` for the replacements.
Total about $0.06, estimated from tokens and documented list prices; Sonnet took $0.055 of it. Saved results: [results/](results/). Scripts read them back unless `--force` is passed.

The saved runs used earlier wordings of the `extract_document` description and the `document_date` description, with the same meaning as the text now in [tools.js](tools.js).

## Step 1: a schema that lets a field be absent

Built: 3 required, 3 nullable, enum with `unclear` and `other`, `category_detail`.
Files: [tools.js](tools.js), [step-1-schema.js](step-1-schema.js)
Executed: yes, 11 of 11 checks, no cost, including validator tests that it can say no.
Descriptions tell the model when to use null. `extract_metadata` and the multi-tool setup are built out in full.

## Steps 2, 3, 4: auto can skip the tool, and a named tool is not alone

Built: the same five kinds of document under each setting. One script, because the comparison is the point.
Files: [step-2-3-4-tool-choice.js](step-2-3-4-tool-choice.js), [results/](results/)
Executed: yes, 7 of 7 checks, $0.0037.

| Setting | Called a tool | Notes |
|---|---|---|
| `auto` | 4 of 5 | The fragment `d14` got a text reply, `stop_reason: end_turn`: "looks like a payment confirmation, not a document I can extract data from". Also a guess at £120 that is nowhere in the document. |
| `any`, three tools | 5 of 5 | Right tool on all three clear kinds. The fragment went to `extract_receipt`, so `any` forces an answer even where a refusal was more honest. |
| named | 5 of 5 | The forced tool came first every time, but `extract_detail` was **also** called on 3 of 5. |
| named, `disable_parallel_tool_use` | 5 of 5 | Only the forced tool, 5 of 5. |

Commonly assumed: forcing a tool means that exact tool and no other. Measured here: the forced tool is guaranteed, but other tools can follow in the same response. A mandatory first step
needs parallel calls disabled, or code that ignores the rest. My first version recorded only the first tool, so its check passed and hid this. I found it because `blocks` showed two `tool_use`. It now records all names.
Extra spend: the named arm was re-run once ($0.0006) to record all names, and a fourth arm added.

## Step 5: nullable types stop invention, and required strings get placeholders

Built: 3 complete and 2 incomplete documents with both schemas, scored against the key.
Files: [step-5-nullable.js](step-5-nullable.js)
Executed: yes, 5 of 5 checks, $0.0019.

| Schema | Fields right | Invented, of 5 absent |
|---|---|---|
| Nullable | 30 of 30 | 0 |
| All required | 26 of 30 | 4 |

Expected going in: an all-required schema invents values. That held, with a difference: plausible invented data is not what happened. Three of the four were the placeholder `<UNKNOWN>`, and one was `Paid by card` as payment terms. The fifth absent field came back as an empty string,
which the scorer treats as absent. A placeholder is still a value in a required string field, and it would pass any schema check. Small sample; a different model might well produce plausible values.
These are `check` calls, since `console.assert` does not stop a script. Output is read by block type rather than `content[0]`, since `thinking` blocks can come first.

## Step 6: top models reject forced `tool_choice`, and two replacements work

Built: real forced attempts on Sonnet 5.5, then strict with auto and `output_config.format`.
Files: [step-6-current-models.js](step-6-current-models.js), [results/current-models-summary.json](results/current-models-summary.json)
Executed: yes, 6 of 6 checks, $0.055 for 15 calls. **Finding: `tool_choice` `any` and named both returned HTTP 400, `tool_choice: type "tool" and "any" are not supported for this model.`**

| Arm, Sonnet 5.5 | Answered | Fields right | Invented | Schema problems |
|---|---|---|---|---|
| strict + auto, no instruction | 5 of 5 | 30 of 30 | 0 of 5 | 0 |
| strict + auto, told to use the tool | 5 of 5 | 30 of 30 | 0 of 5 | 0 |
| `output_config.format` | 5 of 5 | 30 of 30 | 0 of 5 | 0 |

Strict requires every property in `required` and `additionalProperties: false`, so a "3 required, 3 optional" shape does not carry over. Absence is expressed by nullable types only. `auto` is not a guarantee:
these five documents are all clear ones, and the fragment was not sent on this model, so code must still check that a tool was called. A failed check first appeared here because the vendor is printed in capitals; the check was wrong, and it now ignores case. Rerun cost nothing.
The model name `claude-sonnet-5` is not used; these runs use `claude-sonnet-5-5`.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved mode at no cost, and one live `auto` run on `d14` through the server at $0.0002.

## Takeaways

1. Do not build on forced `tool_choice` without checking the model. On the newest ones, use `output_config.format` when you only want JSON, and strict tools with `auto` plus a check when the model must call a tool.
2. Nullable types stopped invention: 0 of 5 against 4 of 5. Required strings on a document without the data get something, even if only `<UNKNOWN>`.
3. A placeholder passes a schema. Validate values if they matter.
4. A forced tool is first and not alone. Set `disable_parallel_tool_use`, or handle only the call you wanted.
5. `any` removes the honest way out. A fragment was filed as a receipt, so keep an `unclear` value and read it.
6. `auto` responded in text on the most ambiguous input, which is exactly where a pipeline is least prepared for it.
