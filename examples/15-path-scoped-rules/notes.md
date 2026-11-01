# 15 Path-scoped rules: notes

Runs: 2026-10-31, Claude Code CLI 2.1.77 on Windows. Working form: [sandbox/](sandbox/). The list form: [sandbox-list-form/](sandbox-list-form/). Blueprint: [../../blueprints/path-scoped-rules/](../../blueprints/path-scoped-rules/).
Isolation: [../../_shared/config-lab.js](../../_shared/config-lab.js). Cost: stub scripts $0, `count_tokens` is not billed, [step-4-live.js](step-4-live.js) $0.1731 across two runs of the script (one superseded).

## A list of several globs never loads (steps 1 to 3)

The three rules were first written with an inline array, `paths: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"]` for testing, with the same shape in the other two.
**The main finding: that syntax never loaded.** Scripted Reads of a test file, an API file and a Terraform file left all three rules out of every request. Forms tested, in [step-1-5-loading.js](step-1-5-loading.js):

| Frontmatter | Result |
|---|---|
| `paths: ["**/*.x"]`, one glob | loads on a matching Read |
| `paths:` block list, one quoted glob | loads on a matching Read |
| `paths: ["**/*.x", "**/*.y"]`, the list form | **never loads, no error** |
| `paths:` block list, two quoted globs | **never loads, no error** |
| `paths: "**/*.x, **/*.y"` | loads on each glob |
| `paths: "**/*.{x,y}"` | loads on each |
| `paths:` block list with an unquoted `**` | YAML breaks, so it **loads in every session** |
| `globs:` instead of `paths:` | no path scoping, **loads in every session** |

The sandbox and blueprint use the quoted comma string. The list form is kept as a control. Whether this is limited to Windows or this version was not tested.
A live run confirmed it with a real model; see step 4.
Also added: a line in `testing.md` telling the model to start each edited test file with a marker comment, for the live test.

## A test file brings in only the testing rule (step 4)

Executed: [step-1-5-loading.js](step-1-5-loading.js), 48 of 48 overall. A scripted model read `.test.ts`, `.test.tsx` and `.spec.ts` files: only the testing rule arrived. [step-4-live.js](step-4-live.js), 6 of 6, $0.0911, Haiku: with the working form, the task "add a test" produced a file starting `// conventions: RULE-TESTING-3301`, which the task never mentioned. With the list form the rule was in no request and the file had no marker.
`/memory`: **not executed**, interactive only; under `-p` it replies `Unknown skill: memory`. **`/context` does not show this either:** it listed no scoped rule in a fresh session, nor on `--resume` after the session had received it. The request body is the only evidence here, so `/context` cannot verify a path rule.
A first live design asked the model to write down the rule ids "given anywhere in your instructions", and it wrote NONE in both setups, at $0.0820. That run did not distinguish them, so the script was replaced by a behavioural test. I did not determine why it answered NONE.

## What triggers a path rule

| Tool on a matching file | Rule attached? |
|---|---|
| Read | **yes, attached to that tool result** |
| Edit after a Read | already there, not repeated |
| Edit with no prior Read | refused by the CLI, no rule |
| Write creating a new file | **no** |
| A later Read of that new file | yes |
| Grep, Glob, Bash `cat` | no, even with file contents in the result |

Commonly assumed: rules load on editing. Measured here: they load on Read, which every Edit needs first. Trap: **a Write that creates a new test file gets no test conventions.** Having the model read a sibling test first solves that.

## Loaded rules accumulate instead of swapping (step 5)

Executed: `src/api/auth.ts` and `services/billing/routes/invoices.ts` load only the API rule. `terraform/main.tf` and `infra/edge/edge.tf` load only the Terraform rule. A utility file loads none. Started in `src/`, the rule for `src/api/**/*` still matched, so globs resolve from the project.
You might expect switching context to swap the loaded rules. Instead **they accumulate.** After three file types, all three rules stayed in every later request. Also a second matching file does not repeat a rule's body.

## The token saving is small next to the CLI's own prompt (step 6)

Executed: [step-6-tokens.js](step-6-tokens.js), 4 of 4. Stub-captured real request, counted with `count_tokens`. All conventions in a root `CLAUDE.md` against path rules, last request of each task. Counts vary by a few dozen between runs, as the temp path length differs.

| Task | All in root | Path rules | Saved |
|---|---|---|---|
| No file touched | 30263 | 29796 | 467 |
| Utility file | 30485 | 30023 | 462 |
| Test file | 30510 | 30250 | 260 |
| API file | 30505 | 30187 | 318 |
| All three file types | 31015 | 31061 | -46 |

Measurably smaller, but keep it in proportion: 1.5% of the request here, because the CLI's own system prompt and tools are about 29,000 tokens. With three short rules the saving hardly matters. It grows with rule size and is repeated per request. In a session touching everything, path rules cost slightly more.
Interactive `/memory` comparison: not executed; replaced by this.

## Takeaways

- After writing a path rule, prove it loads: a planted line and a captured request, or a live test like this one. Nothing else tells you, and neither the CLI nor `/context` reports a rule that never matched.
- Use one quoted comma-separated string for several globs.
- Choose path rules for relevance first. Token savings only matter when rule sets are large.
- Conventions needed for newly created files belong in an unconditional rule, or the task should say to read a similar file first.
- Directory `CLAUDE.md` suits one place. Path rules suit a file type spread across many directories.
