# 10 Tool sets and tool choice: notes

All live runs: 2026-10-31. Agents: `claude-haiku-5-5` (`FAST_MODEL`, `FORCED_TOOL_MODEL`), plus `claude-sonnet-5-5` for the alternative in step 3.
Search results and documents are invented, in [../../_fixtures/research.js](../../_fixtures/research.js).
The research query, the `search_web` description and the `load_document` rejection message were reworded after these runs, with the same meaning, and not re-run.

## Step 1: Three roles with no shared tool

Built: Web search 4 tools, document analysis 5, synthesis 5, with no tool in two roles.
Files: [toolsets.js](toolsets.js), [step-1-2-toolsets.js](step-1-2-toolsets.js)
Executed: yes, 12 of 12 checks, no API cost.
Each tool has a full `input_schema`, written to be valid under `strict: true`.
Three reporting tools, plus `verify_fact` and the escalation tool from step 2, give the synthesis set its 5, within the 4 to 5 per role that the script checks.

## Step 2: A narrow `verify_fact` needs a real way out

Built: One claim, one source ID, with its boundary stated.
Files: [toolsets.js](toolsets.js), [agents.js](agents.js)
Executed: yes, directly and in step 5.
`request_verification` exists so that "escalate to the coordinator" is something the agent can actually do. The
coordinator only records the request in this lab; it does not answer it, as keyword matching over mock data would not be a real verification.

## Step 3: Forcing a tool depends on the model, so order needs a gate

Files: [agents.js](agents.js), [step-3-forced.js](step-3-forced.js)
Executed: yes, 11 of 11 checks.
- Haiku 5.5: `auto` answered in text, `any` picked `extract_metadata`, named picked `extract_metadata`.
- Sonnet 5.5: `any` and named both return HTTP 400.
- Forced, then auto, Haiku: `extract_metadata -> load_document -> extract_data_points -> summarise_content`.
- Auto, a system prompt instruction and `strict: true`, Sonnet 5.5: the same sequence, 0 gate refusals.

Forced `tool_choice` returns a 400 on Sonnet 5.5, Opus 5.5 and Fable 5.1, so this example
uses `FORCED_TOOL_MODEL`. The current alternative on those models is `auto` with an instruction, plus `strict: true` for input shape. `strict` guarantees
the shape, not the order, so I added an ordering gate in the handler, which refuses other document tools until `extract_metadata` has succeeded.
`extract_metadata` takes a URL, not pasted text, so it can be the first step in an agent that also loads its own documents.
Trap: Instruction-based order worked once, which proves nothing about the next run. Only the gate guarantees it, and the gate was tested without a model.

## Step 4: `load_document` refuses what a generic fetch accepts

Files: [load-document.js](load-document.js), [step-4-load-document.js](step-4-load-document.js)
Executed: yes, 20 of 20 checks, no API cost, no network. 3 URLs accepted, 12 hostile URLs rejected with a reason. The generic mock accepted the cloud metadata address.
Design choices:
- A malformed URL makes a bare `new URL` throw. Here it returns a rejection.
- https-only, no credentials in the URL, and a case-insensitive extension check. Without them, `http://` would load and `.PDF` would be missed.
- Validation is also applied in `extract_metadata`, as it takes a URL too.

Left as is: `fetch_page` on the web agent stays generic by design, only over mock pages here. In production it would need its own limits.

## Step 5: All three agents stayed inside their tool sets

Files: [agents.js](agents.js), [step-5-multi-agent.js](step-5-multi-agent.js)
Executed: yes, 11 of 11 checks, final form re-run after tightening one check. Two script runs and one viewer run: 25, 26 and 27 tool calls, 0 outside the caller's set,
about 35,000 tokens per run on Haiku (final script run: 31270 in, 5201 out, probe 3522).
- The document agent started with `extract_metadata`; the blog URL was rejected in code, and the report named it as excluded.
- `verify_fact` was used for the single-source claim. The multi-source claim went to `request_verification`, and the report marked it pending.
- Noticed by the model: "no customer outage" is not the same as "no gateway failed", so it refused to state the claim as fact.
- The web agent searched 4 times in both script runs, and tried to fetch one URL not from its results; the handler returned an error.

Agents run one after another with results passed forward, and tools really execute. Firing the same query at all three agents
and reading only the first response would not show a real workflow.
Checking the logged calls alone cannot fail in practice, because each API call only offers that agent's tools. So I added a guard in the handler for
invented tool names, tested without a model, and a probe asking the synthesis agent to search. It said it could not, and called no such tool.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js): a three-agent run and a free URL validator with hostile presets. Route, validator and one live run checked.

## Takeaways

1. Split tools once an agent's list is long enough to cause misrouting or misuse. One small agent does not need this.
2. Use a narrow tool in place of a broad one whenever the broad one could reach something harmful. The check belongs in the handler.
3. Do not design on forced `tool_choice` without checking the model. If order matters, put a gate in the handler, whichever way you steer the model.
4. A limited cross-role tool needs its way out to be a real tool, or "escalate" is just a word in a description.
5. Measure the claim before repeating it: the latency figures commonly given for this pattern were not reproduced here.
