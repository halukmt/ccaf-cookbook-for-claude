# 14 Commands and skills: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77. Project: [sandbox/](sandbox/). The personal part: [sandbox-user/](sandbox-user/), only ever copied into a temp `CLAUDE_CONFIG_DIR`. Blueprint: [../../blueprints/commands-and-skills/](../../blueprints/commands-and-skills/).
Isolation: [../../_shared/config-lab.js](../../_shared/config-lab.js), as proven in example 13's `step-0-isolation.js`.
Cost: free scripts $0. [step-6-live.js](step-6-live.js) $0.5085, one run, six `claude-haiku-5-5` calls of the CLI, higher than planned since each skill run read 45 KB of source.

## A project command replaces the built-in `/review` (step 1)

Executed: [step-1-5-scoping.js](step-1-5-scoping.js), 28 of 28 overall. `/review the auth code` under `-p` expanded `.claude/commands/review.md` and replaced `$ARGUMENTS`.
Finding: this CLI has a built-in `/review` as well. The project file replaced it for this project.
The command also has `description` and `argument-hint` frontmatter and a planted id.

## A forked personal skill still sees the project's CLAUDE.md (step 2)

Executed: in the temp config only, with the personal `brainstorm` skill set to fork. The body goes to a separate agent with another system prompt ("You are an agent for Claude Code"), and that agent still receives the project's CLAUDE.md.

## `allowed-tools` does not limit a skill (step 3)

Executed: [step-3-tool-matrix.js](step-3-tool-matrix.js), 15 of 15. A scripted model tried Read, Write and Bash from inside the fork; checked by the files they made.

| Frontmatter or setting | Write offered | dontAsk: wrote / Bash ran | bypass: wrote / Bash ran |
|---|---|---|---|
| `allowed-tools: Read, Grep, Glob` | yes | no / no (the mode refuses) | **yes / yes** |
| plus `disallowed-tools: Write, Bash` | yes | no / no | **yes / yes** |
| plus `disallowedTools: Write, Bash` | yes | no / no | **yes / yes** |
| `agent: Explore` | no | no / no | no / **yes** |
| settings `permissions.deny` Write, Edit, Bash | no | no / no | no / no |
| CLI `--disallowedTools Write,Edit,Bash` | no | no / no | no / no |

Reading the table:
- `allowed-tools` only pre-approves. The tools stay in the request. Read did run under `dontAsk` with no other allow.
- **`disallowed-tools` looks like the real boundary, and is not one in this version.** In skill frontmatter, either spelling changed nothing. The real boundaries are a deny rule in settings and the `--disallowedTools` flag.
- `agent: Explore` removes Write and Edit but leaves Bash, which can write under bypass. It is not read-only alone.

## `argument-hint` never reaches the model (step 4)

Executed: `/brainstorm` with no argument under `-p` does not prompt. It runs with an empty `$ARGUMENTS`. The hint text was in no request.
**Not executed:** the interactive picker display, which is where the hint would appear. The blueprint skill tells the agent to stop if no area is named, since nothing else would catch this under `-p`.

## Clones get the command, not the personal skill (step 5)

Executed: a real `git clone` with its own config dir. `/review` works there and `/brainstorm` replies `Unknown skill: brainstorm`. `git ls-files` tracks the command and no skill file.
Trap: **an unknown command under `-p` exits 0** with no API call, so a CI step with a misspelled command, or a personal skill that the runner lacks, looks successful. Check `init.slash_commands` or the output text.
Temp config dirs stand in for a teammate. No push.

Commands versus skills in this version: both support `context: fork`. On the same name the skill's body wins, while both stay advertised. A command without a description advertises its first line to the model. `init.skills` lists skills and not commands; `init.slash_commands` has both. `disable-model-invocation: true` hides a skill from the model's list, and it still runs when typed. The `.claude/commands` route is not outdated here. An HTML comment in a command's body is sent to the model, unlike in CLAUDE.md, so the blueprint keeps its usage notes in YAML comments.

## A typed fork leaves nothing for a resumed session (step 6)

Executed: [step-6-fork.js](step-6-fork.js), 13 of 13, stub. [step-6-live.js](step-6-live.js), 9 of 9, real model. Each row is a skill run followed by a `--resume` question:

| How it ran | Files in follow-up request | Follow-up input tokens | Could answer about the result? |
|---|---|---|---|
| Typed `/brainstorm`, fork | 0 of 3 | 4843 | **No: `NO-RECORD`** |
| Model's Skill tool, fork | 0 of 3 | 6141 | yes |
| Model's Skill tool, inline | 1 of 3 (the model read only one) | 12799 | yes, and it volunteered that it had read only one file |

**You might expect the main conversation to receive the summary.** That holds when the model calls the skill: the result returns as a tool result. When a person types it under `-p`, the output shows the summary but the transcript stores only a placeholder, so **a resumed session knows nothing about it**. A multi-step script must pass that text along itself. **Not executed:** the same check in a live interactive session, which may differ. Under `dontAsk`, a model's Skill call needs `--allowedTools Skill`; a typed command does not.
One live inline run is thin evidence on token ratio: the inline model read fewer files than the fork did, and the stub measured the full effect (57854 vs 2951 characters of messages, with all files read).

## Takeaways

- Team workflow goes in a committed command or skill, and a personal one under the home. A CI runner has neither personal skills nor a warning.
- Do not treat `allowed-tools` as security. For a hard read-only guarantee use `permissions.deny` or `--disallowedTools`.
- Use a fork for exploration whose output would swamp the conversation, and check how the result gets back to whoever needs it.
- Treat `Unknown skill` in stdout as a failure in scripts, because the exit code will not tell you.
