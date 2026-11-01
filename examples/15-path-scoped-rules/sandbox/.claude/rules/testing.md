---
paths: "**/*.test.ts, **/*.test.tsx, **/*.spec.ts"
---
# Test Conventions

Rule id: RULE-TESTING-3301

- Start every test file you edit with the comment line `// conventions: RULE-TESTING-3301`.
- Use describe/it blocks with descriptive sentence-style names.
- Each test must cover at least one happy path and one error case.
- Assert on behaviour, not on implementation details.
- Use factory functions for test data, not inline literals.
- Mock external services at the module boundary.
