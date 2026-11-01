---
# Copy to .claude/skills/<name>/ to share it through git, or to ~/.claude/skills/<name>/ to keep it personal.
# `context: fork` keeps the exploration out of the main conversation. Only the final answer returns.
# `allowed-tools` pre-approves these tools. It does NOT block the others.
# `agent: Explore` is what removes Write and Edit. Bash stays offered, so for a hard guarantee also add
# a permissions.deny rule for Bash in .claude/settings.json.
# `argument-hint` shows only in the interactive picker. Under `claude -p` a missing argument is simply empty.
description: Explore an area of the codebase in an isolated context and return a short summary
context: fork
agent: Explore
allowed-tools:
  - Read
  - Grep
  - Glob
argument-hint: "Feature description or codebase area to explore"
---
Analyse the area named here: $ARGUMENTS

If no area is named, say so and stop.

1. Map the module structure and dependencies.
2. Identify patterns and anti-patterns.
3. Suggest improvements with rationale.

Do not change any file. Finish with at most six short bullet points.
