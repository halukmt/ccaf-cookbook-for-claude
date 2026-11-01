# Claude Code in a CI pipeline

Run reviews and generation unattended with structured output, a failure signal you can trust, and no repeated comments between pushes.

## Use when

- A pipeline should review pull requests or generate tests with no person present
- Findings must reach another system: inline comments, a severity gate, a ledger across runs
- Developers ignore a bot because it repeats itself

## Do not use when

- One person runs an occasional review; a command in the terminal is enough
- The pull request comes from an untrusted fork; do not give that job secrets, and treat its diff as hostile input
- A deterministic linter already finds the problem

## Decision

Call `claude -p --output-format json --json-schema ...` with a `--max-budget-usd` and read-only tools. Read `structured_output`, and fail the step unless `subtype` is `success`. Use one session for generation and another for review, and write a focused review prompt. Store findings as an artifact, give them to the next run as claims to check, require a quoted line as evidence, and let the code decide what is new.

## Trap

Stopping on budget or turns exits 0 with `is_error: false`, so the step is green with no review. A model that answers in plain text under `--json-schema` is retried with no limit; `--max-turns` did not stop that loop, and only a budget did. Stored findings anchor the model: told what was found before, it repeated a fixed SQL injection as still present, word for word. Without `-p` and with no terminal, the CLI did not always hang: with stdin closed it simply answered, and with stdin held open it waited, so behaviour depends on how the runner connects stdin.

## Example

[blueprints/ci-review](../blueprints/ci-review/scripts/ci-review.js): the pipeline, its [schema](../blueprints/ci-review/schemas/findings.schema.json), a [CLAUDE.md section](../blueprints/ci-review/claude-md-ci-section.md), and an [unexecuted workflow](../blueprints/ci-review/.github/workflows/claude-review.yml).
[step-1-3-mechanics.js](../examples/18-ci-review/step-1-3-mechanics.js): testing CLI flags with a scripted misbehaving model.
[step-6-live.js](../examples/18-ci-review/step-6-live.js): two pushes with a control.

## Verified

2026-10-31, Claude Code CLI 2.1.77 on Windows, `claude-haiku-5-5`, local temp repositories. On a second push, stored findings gave 1 comment, against 4 with 3 repeated without them; the fixed issue was marked resolved and open ones kept their ids. A review in a fresh session gave 8 findings, and in the generating session 5, same prompt, one run. Dry-run payloads were printed, and a trap `gh` was never called. Not executed: the GitHub Actions workflow, real posting with `--post`, and any GitHub API call.

## Usual advice vs observed

The usual advice lists `--max-turns` as a CI flag: `--help` here omits it, it stops tool loops, and it does not stop the structured-output retry. Fresh review was stronger on one run, but the prompt moved the count much more than isolation did: 1 finding with a general prompt, 8 with a focused one. The usual claim that CLAUDE.md is what lifts generated tests above boilerplate was only partly true: a project without it still found the factories by exploring, and only the naming rule was lost.
