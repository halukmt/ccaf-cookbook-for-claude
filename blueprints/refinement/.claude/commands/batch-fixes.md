---
# Copy to .claude/commands/. Use when several changes must agree with each other, for example a shape used in three places.
# For changes that do not interact, separate messages are simpler to review.
description: Fix several interdependent issues in one pass so they stay consistent
argument-hint: The issues, and what they share
---
These changes interact, so fix all of them together in one pass and keep them consistent:

$ARGUMENTS

Before editing, read every file involved and decide on one shared structure. Afterwards, check that each file uses the same field names and values.
