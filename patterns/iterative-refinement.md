# Iterative refinement with an agent

Pick the feedback technique that fits the kind of problem, instead of rewriting prose and trying again.

## Use when

- Results differ between runs or miss a convention you never stated
- Behaviour is complex enough that a description cannot pin it down
- You are working in a domain where you do not know what to ask for
- Several changes must agree with each other

## Do not use when

- A one-off change is already right; do not add ceremony
- Changes are independent; one message each is easier to review

## Decision

| Situation | Technique |
|---|---|
| Different interpretations per run | Two or three input and output examples |
| Complex behaviour | Tests, feeding failures back into the same session, with their full message |
| Unknown domain | Ask for questions first, then answer them |
| Interacting issues | One message, or one continuing session |

## Trap

Feedback loses its value silently. A test-loop parser that kept only `error: |-` left the model unable to fix three tests for three rounds, and it looked like a limit of the model; with the whole message, those tests were fixed in one round. Separate sessions for related changes also passed each file's own task while breaking the whole: types promised a field that the class never set. And `--tools ""` with the default system prompt made the model fake tool calls in text, at $0.50 per empty answer, past a $0.10 budget flag, because that limit applies only between calls.

## Example

[blueprints/refinement](../blueprints/refinement/scripts/test-feedback-loop.js): the feedback loop, plus [interview](../blueprints/refinement/.claude/commands/interview-first.md), [batch](../blueprints/refinement/.claude/commands/batch-fixes.md) and [example](../blueprints/refinement/.claude/commands/transform-by-example.md) commands.
[step-5-live.js](../examples/17-iterative-refinement/step-5-live.js): judging a change by running a failure end to end.

## Verified

2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`, small samples. Three prose runs gave two return types and three examples runs gave one. Test feedback went 8 failing, 1, 0. An interview gave 10 questions and its answers all reached the code. Batch and one resumed session passed end to end; three separate sessions did not. Interactive question dialogs: not executed.

## Usual advice vs observed

The usual advice says sequential fixes conflict. In one resumed session they did not; the failure came with separate sessions. Examples fixed the structure but did not make the whole text identical, so a pipeline still needs to parse. Under `-p`, an interview takes two calls, because the question tool cannot reach a person.
