---
description: Analyse an area of the codebase in an isolated context and return a short summary
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
argument-hint: "Name a feature or an area of the code to analyse"
---
Brainstorm id: BRAIN-SKILL-6650

Analyse the area named here: $ARGUMENTS

1. Chart how the modules fit together and what they depend on.
2. Name the patterns and the anti-patterns you see.
3. Recommend changes, each with its reason.

Use Read, Grep and Glob. Read each file in that area. Finish with at most six short bullet points.
