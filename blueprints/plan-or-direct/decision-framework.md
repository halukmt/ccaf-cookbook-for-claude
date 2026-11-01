<!-- Decide plan mode or direct execution for one task. Keep this file wherever people will read it, or import it
     from CLAUDE.md with @./decision-framework.md to give it to the agent as well. Replace the examples with
     your project's. -->

# Plan first or execute directly

**The question is ambiguity, not difficulty.** A hard fix with one obvious shape needs no plan. An easy-sounding feature with several valid shapes does.

## Plan first when

| Signal | Example |
|---|---|
| Several valid approaches exist, and they differ in cost later | "Extract auth into a service": which seams, what happens to the in-process session store? |
| The change crosses files, and a mismatch between them would be expensive | Replacing a library whose functions differ subtly at each call site, with no tests to catch it |
| The code must be explored before the task can be stated | "Why do we see duplicate invoices?" with no failing case yet |
| A decision needs someone else's sign-off before work starts | A schema change other teams depend on |
| A wrong start is hard to undo | A data migration that runs against production |

## Execute directly when

| Signal | Example |
|---|---|
| A stack trace points at one function | `TypeError` at `format.js:3`, and the wanted behaviour is stated |
| The fix and its location are both known | Change a timeout value in one config file |
| The scope is small and holds no design decision | Add a validation check next to the existing ones |
| A test suite would catch a mistake right away | A mechanical migration where every behaviour is under test |

## Ambiguous or difficult?

| Task | Difficulty | Ambiguity | Mode |
|---|---|---|---|
| Fix a race condition, cause already isolated, fix agreed | high | low | Direct |
| "Add notifications to the app" | sounds low | high | Plan |

## Cost note

Planning is not free. In a small measurement, one obvious bug cost about 3.4 times as much planned as fixed directly, with the same result. A covered migration cost about 2.7 times as much and also ended the same. A plan earns that back only where it prevents a wrong direction.

## When running unattended

`ExitPlanMode` needs a person, and it fails under `claude -p`. Separate the phases: run with `--permission-mode plan`, then `--resume` the session with a mode that can write. Do not pass `--allowedTools Write` to the planning run, because it overrides plan mode's limit on writes.
