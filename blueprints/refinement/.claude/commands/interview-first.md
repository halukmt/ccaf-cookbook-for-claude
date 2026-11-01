---
# Copy to .claude/commands/. Use for a task in an area you do not know well: /interview-first <what you need>.
# Under `claude -p` this ends after the questions. Send your answers with --resume <session id>.
description: Ask targeted questions about requirements and failure modes before implementing anything
argument-hint: What you need built
---
I need the following: $ARGUMENTS

Before implementing anything, ask me 5 to 10 targeted questions about requirements, edge cases and constraints that I might not have considered. Cover what happens when it fails. For each question, say in a few words why the answer changes the implementation. Do not write the implementation yet. Do not use tools.
