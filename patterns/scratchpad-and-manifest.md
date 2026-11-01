# Scratchpad and manifest for long exploration

Keep what exploration finds in files outside the conversation, delegate reading to separate conversations, and checkpoint enough to resume after a crash.

## Use when

- Exploration crosses many modules, and the session may be compacted, cut off or handed over
- Reading is much larger than the findings it produces
- Losing an hour of exploration to a crash would hurt

## Do not use when

- The work fits comfortably in one conversation and ends there
- The codebase is small, and an agent can simply re-read what it needs
- A resume or summary is already enough; see [session resume or fresh start](session-resume-or-fresh.md)

## Decision

Run each investigation as its own conversation, returning structured findings with real file names, and let code hold those findings. Have agents write short entries to a known file, and inject one current copy at each step. After each meaningful step, write a manifest through a rename: session ID, explored paths, findings, next steps. On restart, load it and run only what is left, with the findings in the prompt. Give each resumed prompt what the earlier steps found. Test by really killing the process.

## Trap

Adding this because degradation is assumed. On a small session it adds cost and no accuracy, and a scratchpad re-injected into each message grows quadratically. Agents write long entries, so limit their length. A summary injected between phases also does not stop re-reading when a task needs exact lines; and a manifest saved only on task completion loses partial work and its cost.

## Example

[explorer.js](../examples/28-codebase-exploration/explorer.js): subagents and the scratchpad.
[session-run.js](../examples/28-codebase-exploration/session-run.js): the manifest and the resume.
[step-5-compare.js](../examples/28-codebase-exploration/step-5-compare.js): the four-arm comparison.

## Verified

2026-10-31 and 2026-11-01, `claude-sonnet-5-5` and `claude-haiku-5-5`, `@anthropic-ai/sdk` 0.116, one run per arm, on 12 small files with 25 known exports. Full history: 25 of 25 with no scratchpad at 96,101 input tokens, and 25 of 25 with one at 368,690. With old tool calls forcibly dropped: 15 of 25 and 2 wrong with no scratchpad, 25 of 25 with one. Keeping all scratchpad copies in history cost 651,505. A real process killed mid-task resumed in a new process, ran only the remaining two tasks and finished correctly.

## Usual advice vs observed

The usual warning is that long sessions drift to generic phrases like "typical patterns". That never occurred in these runs, at up to 6,668 tokens in one request, which is far too small to test it either way. With its history dropped, the model did not bluff; it marked gaps and distrusted its own earlier true statements, though 2 entries were still wrong.
