<!-- Paste into your project's CLAUDE.md, and replace the paths and criteria with your project's.
     `claude -p` reads CLAUDE.md, so CI gets these rules. Keep it in the committed file: a CI runner has no user-level config.
     Do not move these lines behind an @ import if the job starts in a subdirectory: under -p such an import can be silently dropped. -->

## Testing Standards (CI Context)

- Create test data with the factories in test/factories/. Do not write data literals in tests.
- Fixture files: test/fixtures/.
- Name tests "should <behaviour> when <condition>".
- Test behaviour through the public interface, not internals.
- New code needs 80% branch coverage, and every function needs at least one failure-path test.

## Review Criteria

- critical: security holes, possible data loss, bypassed authentication.
- major: unhandled errors, edge cases with no test.
- minor: naming or style that departs from the project's conventions.
