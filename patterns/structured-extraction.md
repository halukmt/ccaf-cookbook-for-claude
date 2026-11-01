# Structured extraction

Get machine-readable data from a model through the API's schema features, and let absent data be null.

## Use when

- Code consumes the model's answer
- Inputs vary and some information may genuinely be missing

## Do not use when

- A person reads the answer; plain text is fine
- Only a yes or no is needed and a small enum in a simple format is enough; a large schema adds nothing

## Decision

| Need | Newest models that reject forced choice | Models that accept it |
|---|---|---|
| Just JSON | `output_config: { format: { type: "json_schema", schema } }` | Same |
| One known tool must run | `auto`, `strict: true`, an instruction, and code checking a call was made | Named `tool_choice` with `disable_parallel_tool_use` |
| The model picks among tools | `auto`, `strict: true`, and a check | `any` |

Make a field nullable when it may be absent. Strict mode needs every property in `required` plus `additionalProperties: false`, so nullable types are how absence is expressed. Add `unclear` and `other` to enums, plus a detail string.
Find content by block type, since thinking blocks can come first. Schema validity says nothing about truth, so check values separately.

Guidance, not verified by a run here: where strict mode is not in use, treat `required` and `type` in a tool's `input_schema` as requests to the model. A field can be missing or of the wrong type, or the whole payload can arrive as a JSON string inside one field. Normalise the input as it arrives, and stop if nothing usable remains.

## Trap

Required strings on a document without the data got `<UNKNOWN>`, or "Paid by card" as terms. Each is valid against the schema and wrong. A forced tool is also not exclusive: a second, unforced tool followed it in 3 of 5 responses, and reading only the first block hid this. And `any` filed a
contentless fragment as a receipt, where `auto` said honestly that it could not extract anything, so forcing also removes the way out.

## Example

[tools.js](../examples/21-structured-output/tools.js): every schema variant. [step-6-current-models.js](../examples/21-structured-output/step-6-current-models.js): the 400 and its replacements.

## Verified

2026-10-31, `@anthropic-ai/sdk` 0.116, 5 documents. `claude-haiku-5-5`: `auto` called the tool on 4 of 5; `any` on 5 of 5; named on 5 of 5, with a second tool on 3; with parallel calls disabled, only the forced tool on 5 of 5. Absent fields invented: 0 of 5 nullable, 4 of 5 all-required. `claude-sonnet-5-5`: `any` and named returned 400. Strict with `auto` and `output_config.format` each got 30 of 30 fields, 0 of 5 invented, 0 schema problems. About $0.06 in all.

## Usual advice vs observed

The usual advice names `any` as the way to guarantee output, and forced choice as leaving no flexibility. The first returns a 400 on the newest Sonnet, Opus and Fable, and the second allowed an additional tool call. Invented values here were placeholders more than plausible fiction, on one small sample.
