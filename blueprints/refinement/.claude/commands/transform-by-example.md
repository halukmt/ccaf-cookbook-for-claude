---
# Copy to .claude/commands/. Use when a prose description gives inconsistent results.
# Pass 2 or 3 pairs and the target: /transform-by-example Input: a -> Output: b. Input: c -> Output: d. Apply to: e
description: Apply a code transformation defined by input and output examples rather than prose
argument-hint: Input/output pairs, then the target
---
Apply the pattern shown by these input and output examples. Follow the examples exactly, including names, wrapper types and formatting. Add nothing that they do not show. Reply with only the output for the target.

$ARGUMENTS
