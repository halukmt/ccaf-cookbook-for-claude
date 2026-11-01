# 16 Plan mode or direct execution: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5` for the model, one run of each setup. Sandbox: [sandbox/](sandbox/), a small app with an auth module, a seeded bug, and a date library pair whose functions differ subtly. Blueprint: [../../blueprints/plan-or-direct/](../../blueprints/plan-or-direct/).
Isolation: [../../_shared/config-lab.js](../../_shared/config-lab.js). Cost, CLI-reported: [step-1-3-live.js](step-1-3-live.js) $1.1142; [step-4-live.js](step-4-live.js) $0.2758, then $0.2627 after a check was corrected; [step-5-framework.js](step-5-framework.js) `--live` $0.0356. Total about $1.69.
"Plan mode" here means `--permission-mode plan` under `-p`, not the interactive mode switch.

## What plan mode enforces

Executed: [step-0-boundaries.js](step-0-boundaries.js), 24 of 24, free. A scripted model tried everything, since a polite model would never reveal the limits.
- Read runs. Edit, Write, Bash redirection and a mutating Bash command are refused, and the tree stays byte-identical. Write and Edit stay in the request's tool list, so the limit is at execution.
- The plan file under `<config>/plans/` is the one writable exception.
- **`ExitPlanMode` fails under `-p`** with `Exit plan mode?`, because no one is there to approve. The mode stays plan.
- **Trap: `--allowedTools Write` punches through plan mode.** A Write under that flag ran. `Bash(mkdir:*)` under the same flag was still refused.
**Not executed:** the interactive approval dialog and mode switching by keyboard, since a terminal session cannot be driven here. The non-interactive equivalent is plan mode, then `--resume` in another mode, which is proven to write and to carry the plan.

## Plan mode maps a complex task without touching files (step 1)

Executed: [step-1-3-live.js](step-1-3-live.js), 15 of 15 overall. $0.2312, 32 s, 11 tool calls. No file changed. It named all four importers, the 48 call sites, the module-level `Map` that makes extraction hard, and two approaches. It also found a stale comment in `tokens.js`, and wrote the plan to its plan file too.
The prompt does not say "in plan mode", because a prompt prefix does not set the mode. The flag does.

## On a simple bug, planning only adds cost (step 2)

| Setup | Cost | Time | Tool calls | Tests |
|---|---|---|---|---|
| Direct | $0.0493 | 7 s | 3 | 6 of 6 |
| Plan, then execute | $0.1691 | 24 s | 10 | 6 of 6 |

Same result, about 3.4 times the cost when planned. One run each.

## On a well-tested migration, direct did as well (step 3)

Executed: plan with no change to files (it named the mutation difference and the reversed arguments), then `--resume`, Read/Edit allowed.

| Setup | Cost | Time | Tool calls | Date tests | Legacy imports left |
|---|---|---|---|---|---|
| Plan, then execute | $0.4852 | 68 s | 25 | all pass | 0 |
| Direct | $0.1794 | 28 s | 15 | all pass | 0 |

**You might expect planning to pay off here.** The plan was accurate and the result correct, but on this task **direct execution did equally well at 2.7 times less cost**. Its test suite covers every behaviour, including the mutation quirk, so a mistake would be seen at once, and this task is small. One run each; it says nothing about large or uncovered migrations. The direct numbers are logged rather than checked, as this comparison was exploratory.
The anonymous-visitor test stayed failing in both, correctly, since it was out of scope.

## An Explore subagent keeps the main conversation small, at a price (step 4)

Executed: scripted in `step-0`, real in [step-4-live.js](step-4-live.js), 8 of 8.

| Setup | Cost | Handler bodies in main requests | Last main request (chars of messages) |
|---|---|---|---|
| Explore subagent | $0.1710 | 0 | 6292 |
| Inline | $0.0918 | 2 requests | 27608 |

The main conversation stayed clean. Two further details: delegation cost about 1.9 times as much here, because the subagent repeats the system prompt and does extra exploring. It pays only when the main conversation goes on for long enough. And a summary may quote details: all four planted marker comments came through in the second run, one in the first, so my first check on markers was wrong and was replaced by one on handler bodies. Explore keeps Bash, without Write or Edit.

## A decision framework a model can apply (step 5)

Built: [decision-framework.md](../../blueprints/plan-or-direct/decision-framework.md), five plan criteria and four direct ones with examples, plus a costs note from this example's numbers and a note on unattended runs.
Executed: [step-5-framework.js](step-5-framework.js), 7 of 7 with `--live`. It loads through a CLAUDE.md import, and the usage comment is stripped. With only the framework, Haiku classified six tasks correctly, including "hard but clear" as direct and "easy but open" as plan.
The framework's criterion for multi-file changes says "and a mismatch would be expensive", since step 3 showed that merely crossing files does not justify planning.

## Takeaways

- Decide on ambiguity and on the cost of a wrong direction. Good tests lower that cost, and so lower the value of planning.
- Unattended, plan mode is a read-only phase. It ends with `--resume` in another mode, not with `ExitPlanMode`.
- Never pass `--allowedTools Write` to a planning run.
- Delegate exploration when the conversation will continue. For a one-off question, inline is cheaper.
