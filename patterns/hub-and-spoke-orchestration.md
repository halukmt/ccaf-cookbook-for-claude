# Hub-and-spoke orchestration

One coordinator splits the task, briefs isolated workers, checks coverage in code, and sends workers back only for the gaps.

## Use when

- A broad question splits into parts that can be researched or built separately
- Missing a part is costly, so someone has to look for gaps
- Workers need different prompts or tools, and should not see each other's context

## Do not use when

- The steps are known in advance; a fixed pipeline is cheaper and easier to debug
- One agent can hold the whole task; see [plan-or-direct](plan-or-direct.md)
- Parts depend so tightly on each other that workers would need constant exchange

## Decision

Route everything through the coordinator. Split the task in two passes: first list the areas, then ask a separate question about what that list missed. Where the boundary of a topic is itself a decision, take it as an input, and pass it to every stage that shapes the scope. Count coverage in code, with partial coverage not counted as done. Loop on the gaps only, with a threshold as the stop and a round limit as the guard. Name in the output whatever a budget left out. A model that supports forced tool calls can do the structured work, with a stronger one writing the prose.

Guidance, not verified by a run here: when a limit such as a round cap or a delegation cap comes from an optional parameter, test whether the parameter is present before converting it. `Number(null)` and `Number("")` both give `0`, so `Number(x) ?? fallback` never falls back, and `Number(x) || fallback` throws away a deliberate `0`. Use `params.has(key) ? Number(params.get(key)) : fallback`.

## Trap

Incomplete output gets blamed on the worker, when the category was often never assigned. Trace in order: decomposition, delegation, synthesis. A check that searches the whole report counts a topic listed under "not covered" as covered. A boundary rule given only to the second pass can look stable and then lose the category on a later run. A worker named "web search" with no search tool cites from memory, and the source field looks just as good. Costs follow the decomposition, which varied threefold on one prompt, and the final report can outgrow its token limit.

## Example

[coordinator.js](../examples/02-hub-and-spoke/coordinator.js): two-pass decomposition, briefs, coverage and refinement. [step-6-verify.js](../examples/02-hub-and-spoke/step-6-verify.js): the per-stage diagnosis. [step-2-stability.js](../examples/02-hub-and-spoke/step-2-stability.js): measuring a stochastic step.

## Verified

2026-11-01, `claude-haiku-5-5` for structured calls, `claude-sonnet-5-5` for the report, `@anthropic-ai/sdk` 0.116. The final full run covered six required categories, reached 96% of 23 subtopics after two refinement rounds, with 157 findings, for $0.25 computed from tokens at list price. Decomposition with a boundary rule in the second pass only dropped the contested category on one full run; with the rule in both passes it was kept in 5 of 5 runs, using a fixed goal. Decomposition produced 17 to 55 subtopics across runs. A full report hit 16,000 tokens once and failed visibly. The workers had no search tool, so their sources are unchecked.

## Usual advice vs observed

The usual advice relies on forced `tool_choice` for structured output. On `claude-sonnet-5-5` it returned a 400, which stopped the pipeline at its first call until those calls moved to Haiku. A worker starved of context is often described as failing outright. In two runs here it said no documents were attached and then gave unsourced general points, which is harder to notice.
