---
# Keep several globs in ONE quoted, comma-separated string. In Claude Code 2.1.77 a YAML list with more than
# one entry silently never matched. Re-test after upgrading. Unquoted ** in a block list breaks the YAML, and
# then the rule loads in every session.
# Copy to .claude/rules/. Loaded when a matching file is read, written or edited, not at session start.
# Adjust the globs to your stack. They resolve from the project root.
paths: "**/*.test.ts, **/*.test.tsx, **/*.spec.ts"
---
# Test Conventions

- Use describe/it blocks with descriptive sentence-style names.
- Each test must cover at least one happy path and one error case.
- Assert on behaviour, not on implementation details.
- Use factory functions for test data, not inline literals.
- Mock external services at the module boundary.
