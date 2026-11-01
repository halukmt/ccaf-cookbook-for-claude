<!-- No `paths:` frontmatter, so this loads in every session. Add `paths:` to load it only for matching files. -->

# Test Conventions

- Name tests with: describe("ModuleName") > it("should [behaviour] when [condition]").
- Use factory functions for test data, not inline literals.
- Mock external services at the module boundary.
