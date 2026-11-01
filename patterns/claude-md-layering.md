# CLAUDE.md layering

Decide which instructions go at user, project, directory or rule level, and verify what actually loaded instead of assuming it.

## Use when

- A project has conventions that every contributor and CI job must receive
- A monorepo has packages with their own conventions
- Someone reports that Claude ignores a rule that works for a colleague

## Do not use when

- A one-person throwaway project with a handful of rules; one root CLAUDE.md is sufficient
- The behaviour must be guaranteed; use a hook or a gate, because instructions are only instructions

## Decision

Commit shared rules to `.claude/CLAUDE.md` or a root `CLAUDE.md`. Keep personal preferences at user level and nothing the team depends on. Put package-only rules in that package's `CLAUDE.md`. Split topics into `.claude/rules/`, and use imports only for
rules that may safely go missing in some sessions. Diagnose with `claude -p "/context"`, from every directory where sessions start.

## Trap

An import whose target lies outside the session's working directory is an external include. Under `-p` it was dropped silently, so a CI job started in `packages/api` received the project file but not the standards it imports. A missing import path also fails silently. A rule moved to
user level still works for its author, so that person sees nothing wrong while a fresh clone lacks it. `/context` only lists what loaded, so none of these show up as errors.

## Example

[blueprints/claude-md-layout](../blueprints/claude-md-layout/.claude/CLAUDE.md): copy-ready layout.
[step-1-5-loading.js](../examples/13-claude-md-layout/step-1-5-loading.js): proves each loading rule from the request body.
[config-lab.js](../_shared/config-lab.js): testing configuration with loading on, while keeping real user instructions away from the API.

## Verified

2026-10-31, Claude Code CLI 2.1.77, a real CLI against a local stub of the Messages API, plus two guarded `claude-haiku-5-5` runs ($0.0439). In a real `git clone` with another config dir, a planted user-level id was unknown to the model and the committed project id was known. Started in a
subdirectory, the import was missing from the request and from `/context`, and setting the external-include approval flag in the temp config brought it back. Interactive `/memory` and the interactive approval prompt: not executed.

## Usual advice vs observed

The usual account has imports always expanding inline and needing their own line. Here an `@` path mid-sentence also imported, and imports were conditional on the working directory. The usual account also has a directory-level file apply only when working in that directory; here it also arrived attached to a Read of a file in that directory from a session at the root.
