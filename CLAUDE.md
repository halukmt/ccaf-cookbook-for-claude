# ccaf-cookbook-for-claude

Runnable agent patterns for Claude. See [README.md](README.md) for what is here and how to run it.

- Every example makes one decision visible, runs for real, and checks its own result.
- `patterns/` holds one file per concept, each with the date and model of its real run. Change a
  "Verified" line only after a new real run.
- API calls cost money. Run one real pass per concept, sequentially.
- Examples that drive the Claude Code CLI must stay isolated through `_shared/config-lab.js`, so
  they never read or write the user's real `~/.claude`.
- `_local/` is private source material and is ignored by git. Nothing public may depend on it.
- Everything in this repository must always be in English: code, comments, documentation, commit
  messages, viewer text and prompts. The only exception is deliberately foreign test data, such as
  the German invoice `_fixtures/documents/d08-alpine-invoice.txt` and results that quote it.
