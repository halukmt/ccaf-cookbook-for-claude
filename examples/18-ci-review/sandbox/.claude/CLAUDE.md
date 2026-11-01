# Orders service

Plain Node ES modules. Tests run with `node --test`.

## Testing Standards (CI Context)

- Create test data with `buildUser` and `buildOrder` from test/factories/index.js. Do not write data literals in tests.
- Fixture files: test/fixtures/users.json.
- Name tests "should <behaviour> when <condition>".
- Do not test private implementation details.
- Coverage target: 80% branch coverage for new code. Cover at least one failure path per function.

## Review Criteria

- critical: security issues, data loss risk, authentication bypass.
- major: missing error handling, uncovered edge cases.
- minor: naming conventions, style inconsistencies.
