# Commands and skills in Claude Code

Package a repeatable workflow as a command or skill, choose its sharing scope, and know which frontmatter really limits it.

## Use when

- A team repeats a workflow, such as a review with a fixed checklist
- An exploration would flood the main conversation with file contents
- Someone wants a personal workflow that the project should not carry

## Do not use when

- The content is a convention that applies all the time; that belongs in CLAUDE.md or a rule
- A step must be enforced; a skill is text the model follows, while a hook or a permission rule holds

## Decision

Commit `.claude/commands/` or `.claude/skills/` for the team, and keep personal ones under the home. Add `context: fork` to anything verbose. Add `allowed-tools` so its tools run without a prompt. For a real read-only limit, add a `permissions.deny` rule in settings or pass `--disallowedTools`.
`agent: Explore` removes Write and Edit, and it leaves Bash. Tell the skill what to do with an empty argument, because `argument-hint` does nothing under `-p`.

## Trap

`allowed-tools` reads like a restriction and is a pre-approval: with bypass permissions, a skill listing only Read wrote files through Write and Bash. `disallowed-tools` in frontmatter was ignored in every spelling tried. An unknown command under `-p` exits 0, so a CI step that names a missing skill looks green. And a typed forked skill under `-p` shows its summary in the output
while the session keeps only a placeholder: resume it and the model has no idea what happened.

## Example

[blueprints/commands-and-skills](../blueprints/commands-and-skills/.claude/skills/explore-area/SKILL.md): a read-oriented skill, and a [review command](../blueprints/commands-and-skills/.claude/commands/review.md).
[step-3-tool-matrix.js](../examples/14-commands-and-skills/step-3-tool-matrix.js): testing tool limits with a scripted model and the files it creates.
[step-6-fork.js](../examples/14-commands-and-skills/step-6-fork.js): what a later request really carries.

## Verified

2026-10-31, Claude Code CLI 2.1.77. Tool matrix and scoping against a local stub of the Messages API, with a real `git clone` as the second developer. With `claude-haiku-5-5` ($0.51), a follow-up after a forked skill held none of the source files, at 6141 input tokens, against 12799 inline. After a typed fork the model replied that it had no record. The interactive picker and interactive forks: not executed.

## Usual advice vs observed

The usual advice calls `disallowed-tools` the actual boundary; it had no effect here. It also says the main conversation receives the fork's summary; that held for a model's Skill call and not for a typed command under `-p`.
