---
name: agent-architecture-review
description: Reviews a project that uses Claude agents, tools, MCP or Claude Code configuration and recommends specific patterns with file-level reasons. Use when the user asks to review an agent design, harden an agent, or decide which agent patterns apply to a project.
allowed-tools: Read, Grep, Glob
---

# Agent architecture review

Scan the project and recommend only the patterns its code actually calls for. This review only reads.
Do not edit files, run the project, or call any API.

## Steps

1. Read [index.md](index.md), which maps signals in a project to patterns.
2. Scan the project for those signals. Start with the dependency manifest, `CLAUDE.md`, `.mcp.json`,
   `.claude/`, CI workflows, and code that calls an Anthropic SDK, the Agent SDK or the `claude` CLI.
3. Read `../../patterns/<name>.md` only for patterns whose signals you found. Check its "Do not use
   when" section against the project before recommending it.
4. For each recommendation, read the code it concerns and check whether the project already solves
   the problem. Treat a pattern that is already in place as a confirmation, not as a gap.

## Report

Order recommendations by the cost of the failure they prevent. For each one, give:

- **Pattern:** its name and the path to the pattern file
- **Evidence:** the `file:line` that triggered it
- **Risk:** what goes wrong here if nothing changes
- **Change:** the smallest sufficient change for this project
- **Example:** the runnable example or blueprint the pattern file links to

Then list what you checked and found fine, and any part of the project you could not assess.

Rules for the report:

- Every recommendation needs evidence from this project. Leave out anything that is only generally
  good advice.
- Each pattern file says which model and tool version it was verified on. Say so when the project uses
  a different version, because that result may not carry over.
- If nothing applies, say that plainly. A short report is a good result, and adding machinery the
  project does not need is itself a defect.
