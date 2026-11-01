# 13 CLAUDE.md layout: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77. Sandbox: [sandbox/](sandbox/). Blueprint: [../../blueprints/claude-md-layout/](../../blueprints/claude-md-layout/).
Free scripts run a real CLI against a local stub of the Messages API ([../../_shared/config-lab.js](../../_shared/config-lab.js)): real config loading and real request, scripted model.
Cost: free scripts $0 and $0.0439 for [step-6-live.js](step-6-live.js), `claude-haiku-5-5`.

## Isolation

Built: [step-0-isolation.js](step-0-isolation.js), 14 of 14. `CLAUDE_CODE_DISABLE_CLAUDE_MDS` is not set in this example's runs.
How: working directory under `C:\tmp`, which is outside the home with nothing instructive on the way up (`findLabBase` refuses otherwise); HOME, USERPROFILE and AppData variables point to temp; `CLAUDE_CONFIG_DIR` to temp. Stub runs use a dummy key and a dead HTTPS proxy. Live runs first do a stub preflight, then go through a proxy that checks each body and refuses forwarding on a private marker.
Evidence: planted project and user files load, the real global file's markers are in no request, and a decoy in a fake home was picked up when the working directory sat under that home, even with another `CLAUDE_CONFIG_DIR`. So the walk-up is real and the outside-home location is what prevents it. The system temp directory is under the home here and cannot be used.

## A project file in `.claude/` loads at the root (step 1)

Built: naming via import, error handling and review checklist sections.
Files: [sandbox/.claude/CLAUDE.md](sandbox/.claude/CLAUDE.md)
Executed: [step-1-5-loading.js](step-1-5-loading.js), 30 of 30 overall. In the first request at the root. Labelled "project instructions, checked into the codebase".
Planted ids in each file let a test tell them apart. The blueprint has none.

## A package file also arrives through a Read from elsewhere (step 2)

Executed: `packages/api/CLAUDE.md` is absent at the root and present when the session starts in `packages/api`.
Also: a session at the root that Reads `packages/api/handler.js` gets the package file attached to that tool result. So scoping to a directory includes reading a file there from elsewhere. It is absent from the first request and arrives with the tool result.

## A rule without frontmatter loads everywhere (step 3)

Executed: `.claude/rules/testing.md` has no frontmatter and loads in every session, from the root and from a subdirectory. Rules at user level (`<config>/rules/*.md`) also loaded in a one-off probe that is not part of a script.

## How `@` imports resolve and fail (step 4)

Executed: `@./standards/naming.md` loads `.claude/standards/naming.md`, listed by the CLI as its own file.
Details, all checked:
- From `.claude/CLAUDE.md`, only `.claude/standards/` resolves. A file at the repo root is not reached.
- An import need not stand on its own line: `@sub/inline.md` mid-sentence was imported. No `./` is required either. Imports nest. An `@` inside a code fence is not imported.
- A missing import is dropped silently, with no error. The `@` line itself is still sent as text.
- HTML comments in CLAUDE.md are stripped before sending, so usage notes in comments cost no tokens.

## An import can vanish silently in a subdirectory (step 5)

Executed: `claude -p "/context"` works in this version, makes no API call and prints a Memory Files table that matched the request body at the root and in the package. So it stands in for the interactive command here.
Not available: `/memory` under `-p` replies `Unknown skill: memory`. The interactive `/memory` editor: **not executed**.
**The main finding.** You might expect the imported standards to appear as part of project config in both directories. Started in `packages/api`, the project file loads but its import is **silently missing**, from both the request and `/context`. The target lies outside the working directory, so it counts as an external include, which needs a per-project approval. Setting `hasClaudeMdExternalIncludesApproved` in the temp config's `.claude.json` makes the same import load, which isolates the cause. **Not executed:** the interactive approval prompt. A person may see a prompt there; a CI job under `-p` sees nothing.
Trap: `/context` shows only what loaded. It does not say what was dropped.

## A user-level convention exists for one developer only (step 6)

Built: [two-developers.js](two-developers.js) moves one line to a temp user file, commits, and makes a real `git clone` with a second config dir. No real `~/.claude` touched.
Executed: [step-6-user-scope.js](step-6-user-scope.js) 8 of 8. [step-6-live.js](step-6-live.js) 5 of 5, with a planted id: the first developer's model answered `STD-PROJECT-4471` and `CONV-VERBOSE-8823`; the second answered `STD-PROJECT-4471` and `NONE`.
Temp config dirs stand in for a real teammate and a real home directory.

## Takeaways

- Team rules go in a committed project file. A rule in a user file looks fine to its author and does not exist for anyone else, and nothing warns either side.
- Check `/context` under `-p` in a real project, from the root and from each directory where sessions start. Compare with what you expect, since dropped files are not reported.
- Do not put must-arrive rules behind an import if sessions or CI jobs start in subdirectories. Put them in the project file or an unscoped rule.
- A misspelled import path fails silently. A CI check that every `@` target exists would catch it. Not built here.
- Testing config needs a working directory outside the home, or real user instructions come along through the walk-up even with `CLAUDE_CONFIG_DIR` set.
