<!-- Team-wide standards. Commit this file: everyone who clones the repo receives it.
     Keep it short: every line is sent on every request. HTML comments are not sent. -->

# Coding Standards

<!-- The path resolves from this file, so this is .claude/standards/naming.md.
     A session started in a subdirectory drops this import under `claude -p`, because the target is outside
     its working directory. Put a rule directly in this file, or in .claude/rules/, if it must always arrive. -->
@./standards/naming.md

## Error Handling

- Always use typed error classes.
- Never swallow exceptions silently. Log or rethrow.

## Code Review Checklist

- Verify test coverage for new functions.
- Check for hardcoded credentials.
