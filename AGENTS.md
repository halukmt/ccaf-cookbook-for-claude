# Using this repository as an AI assistant

This repository is a reference for choosing and building Claude agent patterns.

## Find what applies

1. Read [skills/agent-architecture-review/index.md](skills/agent-architecture-review/index.md), which
   maps signals in a project to patterns.
2. Read only the matching files in [patterns/](patterns/).
3. Follow a pattern's link to its runnable example in [examples/](examples/), or copy from
   [blueprints/](blueprints/).

For a full project review, follow
[skills/agent-architecture-review/SKILL.md](skills/agent-architecture-review/SKILL.md).

## How to weigh what you read

- "Verified" lines give the date, model and version of a real run. Results may not carry over to
  other versions.
- "Guidance, not verified by a run here" means no run backs that statement.
- Each example's `notes.md` lists what was not executed. Many comparisons rest on one run.
- Prefer the simplest sufficient pattern. Check the "Do not use when" section first.

## Running examples

Runs cost money and need an `ANTHROPIC_API` key in `.env`. Do not run them without the user's
approval. Scripts with saved results replay them for free unless you pass `--force`.
