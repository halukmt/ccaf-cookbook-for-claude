# Tool scoping

Give each agent only the few tools its job needs, and shape each tool so it cannot do more than that job.

## Use when

- Several agents share a system and have different jobs
- An agent has a broad tool such as "fetch any URL" or "run any query"
- A step must always run first, such as reading metadata before analysis

## Do not use when

- One agent with a few tools does the whole job; there is nothing to distribute
- Tools are read-only over harmless data, and misuse costs little

## Decision

Assign four or five tools per role, with no tool in two roles. Where a role keeps needing one small thing from another, give it a limited
version with a stated boundary and a tool for handing over the harder case. Replace generic tools with narrow ones whose limit is checked in
the handler. For order, do not rely on `tool_choice` alone: put a gate in the handler that refuses later tools until the first has succeeded.

## Trap

Forced `tool_choice` looks like the guarantee, but `any` and named selection return a 400 on some current models, so a design resting on it
stops working when the model is upgraded. Also, a test that "no agent called another agent's tool" proves little, since the API call only
offered that agent's tools. Test a role boundary by tempting the agent and by calling the guard directly. Allowlist checks have their own
failure: `endsWith` on the whole URL, or a hostname substring test, passes lookalike domains and query-string tricks.

## Example

[toolsets.js](../examples/10-tool-distribution/toolsets.js): the roles and the limited tool.
[load-document.js](../examples/10-tool-distribution/load-document.js): the narrow tool's validation.
[agents.js](../examples/10-tool-distribution/agents.js): the guard and ordering gate in one place.

## Verified

2026-10-31. `claude-haiku-5-5`: `auto` answered with no tool, `any` and named forced a tool. `claude-sonnet-5-5`: `any` and named both 400;
`auto` with an instruction and `strict: true` still called the required tool first, and the gate never fired, one run. Three three-agent
runs on Haiku: 25 to 27 calls, all in the caller's set, the required tool first, an untrusted URL rejected in code. Asked to search the web, the
synthesis agent said it could not. Twelve hostile URLs were rejected.

## Usual advice vs observed

The usual advice presents named `tool_choice` as the way to enforce order. It works on Haiku 5.5 but not on the newest Sonnet, Opus and Fable. The
latency saving usually quoted for limited cross-role tools was not measured here.
