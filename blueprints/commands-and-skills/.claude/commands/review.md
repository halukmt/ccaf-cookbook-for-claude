---
# Copy to .claude/commands/ and commit: every clone gets /review, and it replaces the built-in /review here.
# Keep notes in this frontmatter. An HTML comment in the body of a command is sent to the model.
description: Review the staged changes against the team checklist
argument-hint: Optional focus area
---
Review the staged changes against our team checklist:

1. Check error handling patterns.
2. Verify test coverage for new functions.
3. Confirm API naming conventions.
4. Flag any hardcoded credentials or secrets.

Focus area, if any: $ARGUMENTS
