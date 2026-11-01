# 20 Few-shot examples: notes

All live runs: 2026-10-31, `claude-haiku-5-5`, sequential. Total about $0.02, estimated from real tokens and the documented list price.
Saved results: [results/](results/). Scripts read them back unless `--force` is passed.

**Short version: the expected failure did not appear.** Thorough instructions alone got 119 of 120 fields right on Haiku 5.5, with no empty field, including narrative
documents and amounts in words. Few-shot examples moved that to 120 of 120, so there was almost nothing to improve. The examples did not fix the code fence on every reply. The most interesting
result is a sum problem no example can solve. Small set, one model, three runs.

The saved runs used an earlier wording of the first two lines and the last line of `BASE_PROMPT`, with the same meaning as the text now in [extract.js](extract.js).

## Fixture

Files: [../../_fixtures/documents/](../../_fixtures/documents/), [../../_fixtures/documents-answers.js](../../_fixtures/documents-answers.js)
20 documents: invoices, receipts, reports, a contract and a fragment, across table, narrative and mixed layouts. Standard, international, scanned and handwritten segments. Known gaps and known errors.
The test set here is 10 of them, 3 tables, 3 narratives and 4 mixed.
Correction made after reading results: run 1 scored `[1200, 1200, 340]` for "two workshops at twelve hundred euros each" as wrong. That is a fair split and my key was too narrow, so `acceptAmounts` was added and the
saved results rescored at no cost. Baseline accuracy went from 97% to 99%.

## Step 1: thorough instructions alone get nearly everything right

Built: thorough field instructions, with a line demanding a value for every field.
Files: [extract.js](extract.js), [step-1-baseline.js](step-1-baseline.js), [results/baseline.json](results/baseline.json)
Executed: yes, 7 of 7 checks, $0.006 for 30 calls. 119 of 120 fields right, 0 of 114 empty.
Expected going in: correct tables, and empty or wrong narrative fields. Measured: tables, narratives and mixed scored 100%, 100% and 98%.
The instructions define tax and subtotals. Without that the key could not be fair.

## Step 2: the real failures are fences and one invented date

Built: outcomes per field and structure, and the three triggers.
Files: [step-2-failures.js](step-2-failures.js)
Executed: yes, 3 of 3 checks, no cost.
Real failures: 30 of 30 replies in a code fence. One invented partial date, `--02-14`, from "Feb 14" with no year. 2 of 10 documents differed between runs. 0 empty fields.
Outcomes separate a wrong value and an invented one. Marking fields only as extracted or empty would treat both as success.

## Step 3: three examples, each with its reasoning

Built: table, narrative and mixed examples, aimed at what step 2 found and at common traps: a missing vendor, a missing year, subtotal and discount, quantity times price.
Files: [step-3-examples.js](step-3-examples.js)
Executed: yes, 13 of 13 checks, no cost.

## Step 4: examples gain one field, and fences stay

Built: the same 10 documents, 3 runs.
Files: [step-4-compare.js](step-4-compare.js), [results/few-shot.json](results/few-shot.json)
Executed: yes, 3 of 3 checks, $0.007.

| Over 3 runs | No examples | Three examples |
|---|---|---|
| Fields right | 119 of 120, 99% | 120 of 120, 100% |
| Empty, data exists | 0 of 114 | 0 of 114 |
| Invented, data absent | 1 of 6 | 0 of 6 |
| Bare JSON | 0 of 30 | 0 of 30 |
| Documents identical across runs | 8 of 10 | 9 of 10 |

Expected going in: fewer empty fields **did not hold**, 0 to 0. Better format **did not hold**, 0 to 0 of 30. Higher accuracy held by one field, which is noise-level evidence. Narrative gaining most **did not hold**,
it was already 100%.
The comparison is computed, not hardcoded.

## Step 5: which technique fits which problem, with a sum no example fixes

Built: each problem with its technique and the measured figures, plus three probe documents, 18 calls.
Files: [step-5-matrix.js](step-5-matrix.js), [results/matrix.json](results/matrix.json), [results/probes.json](results/probes.json)
Executed: yes, 5 of 5 checks, $0.005.

| Problem | Technique | No examples | Examples |
|---|---|---|---|
| Empty narrative fields | Few-shot | 0 of 114 | 0 of 114, not testable here |
| Invented partial date | Few-shot, nullable field | 1 of 6 | 0 of 6 |
| Fabrication on sparse documents | Nullable schema fields | 7 of 12 | 5 of 12 |
| Reply in a fence | Tool use or structured output | 30 of 30 | 30 of 30 |
| Total does not match sum | Validation loop | 2 of 3 kept the gap, 1 closed it | 3 of 3 kept the gap |
| Wrong tool | Better descriptions | not tested | not tested |

- Fabrication barely changed, as expected. Nearly all of it is one thing: a document with a total and no items gets a single line item equal to the total. Only one vendor was invented ("accounts").
  That line item is arguably a fair reading, so the rate depends on my key.
- **The one run that matters.** On the document whose lines add up to 335 and whose total says 355, one no-examples run added `"Unexplained difference (not itemized in document)", 20.00`, so the sum matched. A note below the JSON
  said so, but a parser reading only the JSON sees a clean invoice. This is the sum problem in its worst form: an instruction to fill every field, and a sum that closes. My first check here assumed all
  three runs would keep the gap. It failed, and the check was wrong and not the code, so I replaced it with what is actually true of the six answers.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Page returned 200. Saved mode at no cost, and one live run on `d12` through the server at $0.0005.

## Takeaways

1. Run the baseline first. On this model, careful instructions had already solved what examples are usually sold for. Adding examples then is cost with no measured benefit.
2. Few-shot examples did not make replies parse, 30 of 30 fenced either way. Output shape belongs to the API, not to examples.
3. Line items that fail to add up need a check in code. A model can quietly make them add up.
4. Key your own scoring carefully. Reading the failures showed one of them was my key's fault. Rates computed from a key are only as fair as the key.
5. A harder or more varied set may well show the classic effect. This set does not, and I did not make it harder until it did.
