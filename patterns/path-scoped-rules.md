# Path-scoped rules

Load a convention only when the agent touches matching files, and prove that it really loads.

## Use when

- A convention follows one kind of file that lives in many folders, such as tests next to their sources
- A monorepo holds unrelated stacks, and rule sets are large enough to matter
- Instructions for one area keep distracting work in another

## Do not use when

- The rule must also reach newly created files; a Write does not trigger it
- The conventions are few and short; the token saving is negligible
- All matching files sit in one directory; a `CLAUDE.md` there is simpler

## Decision

Put each topic in `.claude/rules/<topic>.md` with one quoted, comma-separated `paths` string. Then test it once: plant a behaviour the task never mentions and see whether the result shows it. Keep anything needed for new files unconditional, or have the task read a similar file first.

## Trap

Two silent failures in opposite directions. A YAML list with more than one glob, the form usually shown, never matched, with no error. An unquoted `**` in a list, or `globs:` instead of `paths:`, removes the scope, so the rule loads in every session. `/context` does not list a scoped rule, even when a session really received it, so it cannot tell these cases apart. Rules also accumulate across a session rather than swapping.

## Example

[blueprints/path-scoped-rules](../blueprints/path-scoped-rules/.claude/rules/testing.md): copy-ready rules with a working frontmatter form.
[step-1-5-loading.js](../examples/15-path-scoped-rules/step-1-5-loading.js): tests each frontmatter form and each tool from request bodies.
[step-4-live.js](../examples/15-path-scoped-rules/step-4-live.js): a behavioural check with a real model.

## Verified

2026-10-31, Claude Code CLI 2.1.77 on Windows, scripted model against a local stub of the Messages API, counted with `count_tokens`, plus `claude-haiku-5-5`. The rule attached to a Read result; not to Write, Grep, Glob or Bash. In the live run a task to add a test gave a file carrying the rule's marker, and the multi-glob list gave no marker. Three short rules saved about 460 of 30,000 input tokens on an unrelated file, and cost 46 more in a session touching all three types. Interactive `/memory`: not executed. Other platforms and versions: not tested.

## Usual advice vs observed

The usual form is a multi-glob array; it did not load here. Rules are usually said to load on edit and to swap as context changes; they arrived on Read and stayed. The token saving is real and modest, since the CLI's own prompt and tools dwarf three short rules.
