# Code navigation and edit with built-in tools

Find code by searching its contents, find related files by name, read only what a search justified, and change it with targeted edits.

## Use when

- An agent changes code across several files of an existing project
- A function, setting or API must be traced to everyone who uses it
- The project is too big to read in full, or context budget matters

## Do not use when

- There is one small known file; just read and edit it
- A structural change needs a language-aware tool, such as a typed rename across many files with overloads; text search will miss or overmatch
- An edit rewrites most of a file; a full write is simpler

## Decision

Grep for the symbol. Glob for tests and similar names. Read files the search named, and follow barrels and wrappers from their imports. Edit with an anchor that includes enough surrounding text to be unique, and use `replace_all`
only if every occurrence should change. Restrict the tool list when a run should not have shell or write access. Afterwards, verify by running the changed code.

## Trap

Text search stops at indirection: a caller behind a wrapper never mentions the old name, so "no matches" does not mean "no users". Also, tests that passed before a migration and still pass after it say nothing about whether the new code path is reached; a probe that reports which
implementation ran does. And the wording of the non-unique error is an implementation detail: do not parse it.

## Example

[refactor-lab.js](../examples/12-built-in-tools/refactor-lab.js): the prompt, the tool restriction, and a judge that reads the real tool calls and runs the result.
[step-0-judge-selftest.js](../examples/12-built-in-tools/step-0-judge-selftest.js): proving the judge fails on bad runs.
[legacy-orders](../_fixtures/legacy-orders/): direct, barrel and wrapper callers.

## Verified

2026-10-31, Claude Code CLI 2.1.77, `claude-haiku-5-5`, one run, on a temp copy. With the order given in the prompt: Grep, Glob, five Reads, nine Edits, final Grep. Three unrelated files stayed unopened. The short anchor failed with "Found 3 matches of the string to replace, but
replace_all is false". A wider anchor changed one call, and `replace_all` changed two in another file. Running the code showed five functions on the new API and two deliberately on the old.

## Usual advice vs observed

The error text differs from how it is usually quoted, though the behaviour matches. This run does not show the model choosing this order by itself, because the prompt gave it and also forced the failing Edit. The context saving of Edit over a full rewrite was not measured.
