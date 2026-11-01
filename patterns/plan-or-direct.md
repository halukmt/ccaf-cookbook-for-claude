# Plan first or execute directly

Choose by how open the task is and what a wrong start would cost, and run the planning phase safely when nobody is watching.

## Use when

- A task has several valid shapes, or must be explored before it can be stated
- A wrong direction would be expensive, for example when no tests would catch it
- A pipeline wants a read-only analysis before any change

## Do not use when

- The location and the fix are both known; planning only adds cost
- A good test suite would catch a mistake straight away
- A one-off question will not be followed up; inline exploration is cheaper than a subagent

## Decision

Open task or costly mistake: plan, then execute. Clear task: execute. Unattended, run `--permission-mode plan`, keep the plan text, then `--resume` the session with a mode that can write. For discovery in a conversation that will continue, delegate to the Explore subagent.

## Trap

`ExitPlanMode` needs a person. Under `-p` it fails, and the mode stays plan, so a pipeline waiting on it stalls in read-only. `--allowedTools Write` on a planning run overrides the limit, and the planning phase can change files. A plan prefix in the prompt does nothing; only the flag sets the mode. Crossing many files is not by itself a reason to plan, since a covered migration came out the same at a third of the cost without one.

## Example

[blueprints/plan-or-direct](../blueprints/plan-or-direct/decision-framework.md): a framework with criteria, examples and notes on unattended runs.
[step-0-boundaries.js](../examples/16-plan-or-direct/step-0-boundaries.js): testing a mode's limits with a scripted model.
[step-1-3-live.js](../examples/16-plan-or-direct/step-1-3-live.js): comparing setups by tests and tool calls.

## Verified

2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`, one run each. Plan mode refused Edit, Write and mutating Bash and left the tree byte-identical. One bug cost $0.049 direct and $0.169 planned, with the same passing tests. One covered migration cost $0.179 direct and $0.485 planned, both correct. Explore left no file bodies in the main requests and cost about twice inline. The interactive approval dialog and mode switching: not executed.

## Usual advice vs observed

The usual advice has multi-file migrations always planned. Here planning made a covered one more expensive with no better result; that is one small task, not a general result. The usual account of Explore mentions the clean conversation and not the price of delegating.
