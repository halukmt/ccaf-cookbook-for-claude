# Explicit subagent context

Write everything a subagent needs into its prompt, source metadata included, and restrict what it can do with settings that really restrict it.

## Use when

- A coordinator spawns subagents through the Agent SDK or Claude Code
- A later agent must cite what an earlier one found
- Independent subagents could run at the same time

## Do not use when

- One agent does the work and holds all of the context; subagents only add cost
- The output needs no attribution, so a plain summary can be passed on
- A step depends on an earlier result; it has to run after it, not beside it

## Decision

Treat the prompt as the subagent's whole world. Pass findings as structured data, with claim, URL, document, page and confidence kept together, and embed them whole in the next prompt. Then read the prompt the subagent actually received in the transcript, since the coordinator model retells it. To allow only certain tools, list them in the subagent's `tools`. To stop an agent spawning subagents, use `disallowedTools`. For latency, tell the coordinator to issue independent calls in one response. For attribution past this point, see [claim-source-provenance](claim-source-provenance.md).

Guidance, not verified by a run here:

- A weak result usually points to a weak brief, so correct the prompt you sent before changing the subagent's own instructions, tools or model.
- Having a tool does not make a subagent use it. Even when told to, it may reply from what it already knows, so look for the `tool_use` block in the transcript.
- To tell which subagent wrote a message, record `input.subagent_type` by `tool_use_id` when it is spawned, and look that up through the message's `parent_tool_use_id`. Guessing from the text goes wrong once two subagents use similar words.

## Trap

Leaving `Agent` out of `allowedTools` looks like closing a gate and does not. `allowedTools` pre-approves; it does not decide which tools exist. Asking a subagent which tools it has returns an invented list, so read its `tool_use` blocks. A citation check that looks for any URL anywhere passes a report with a claim that cites nothing, so test the check on forged reports. A denied tool does not crash anything: the subagent reports that it found nothing, and the run carries on.

## Example

[step-1-gate.js](../examples/03-subagent-context/step-1-gate.js): what closes the gate and what does not. [step-4-synthesis.js](../examples/03-subagent-context/step-4-synthesis.js): passing findings whole, then checking what arrived. [finding.js](../examples/03-subagent-context/finding.js): `verifyAttribution`. [step-6-parallel.js](../examples/03-subagent-context/step-6-parallel.js): parallel spawning, checked by timing.

## Verified

2026-11-01, `claude-sonnet-5-5`, `@anthropic-ai/claude-agent-sdk` 0.3.226, one run per script, $1.06 in all, 48 of 48 checks across the steps. Each subagent called only its declared tools. Cited URLs appeared in what the search tool returned, document figures were on their cited pages, and the metadata reached the synthesis prompt. Forged reports were rejected. Two calls in one response overlapped in time, 16.4 s overall; a sequential run was not measured. The full coordinator, about $1.12 on 2026-10-31, was not re-run in its final form, and its stream reading was tested with a scripted stream only. Haiku recognising custom subagents was not re-tested.

## Usual advice vs observed

The usual account calls `Agent` or `Task` in `allowedTools` a hard requirement for spawning.

| Configuration | Spawned | Spawn tool on offer |
|---|---|---|
| Not in `allowedTools`, bypass mode | yes | yes |
| Not in `allowedTools`, `dontAsk` mode | yes | yes |
| In `allowedTools`, bypass mode | yes | yes |
| In `allowedTools` and in `disallowedTools` | no | no |

An earlier run through another API provider showed the opposite, on a version not recorded, so test this on your own version. The citation check usually offered also compares a claim with the text it was taken from, so that half cannot fail.
