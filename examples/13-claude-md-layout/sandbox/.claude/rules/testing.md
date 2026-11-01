# Test Conventions

Testing id: STD-TESTING-9310

- Name tests with: describe("ModuleName") > it("should [behaviour] when [condition]").
- Use factory functions for test data, not inline literals.
- Mock external services at the module boundary.
