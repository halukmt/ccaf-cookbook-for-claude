# 30 Source provenance: notes

All live runs: 2026-11-01. Subagents on `claude-haiku-5-5`, because forced `tool_choice` returns a 400 on Sonnet 5.5. Synthesis on `claude-sonnet-5-5`. One run, sequential, on local invented documents. $0.028 for the pipeline, plus $0.017 for the live viewer check. Saved: [results/](results/).
`_fixtures/research.js` is reused for two documents. New file [_fixtures/research-conflicts.js](../../_fixtures/research-conflicts.js) adds four, with three known conflicts: a trend, a difference of method, and an unexplained contradiction.
The report tool's description and two sentences of the synthesis prompt were reworded after those runs, with the same meaning. The saved runs used the earlier wording.

**Short version:** 16 of 16 mappings verified against their sources with a word-for-word excerpt. With an attribution rule, 0 of 14 sentences lacked a citation and every number was in what its sentence cited. Without the rule, all 19 sentences were uncited, which confirms the expectation that synthesis drops attribution unless told. But that report named its sources loosely, kept every conflicting value, and even noticed a disagreement that the code and the attributed report missed. So the citation rule and useful analysis are separate things. The rule also failed on 2 sentences in a second live run, caught by the check.

## Step 1 — A claim schema that code can compare

Files: [provenance.js](provenance.js), [step-1-offline.js](step-1-offline.js)
Executed: 35 of 35 checks, no API cost: each checker is shown forgeries it must reject.
A JSON schema. `measure` and `value` are added beyond the five core fields, because they make conflicts comparable in code. The measure list is a closed set that I chose in advance, which a project with unknown topics would not have. That is scaffolding.

## Step 2 — Every mapping verified against its own document

Files: [pipeline.js](pipeline.js), [step-2-5-pipeline.js](step-2-5-pipeline.js)
Executed: 8 findings each, 16 verified. Each field is checked against the document it names: URL, title, date, a word-for-word excerpt, and every number in the claim.
`claude-haiku-5-5` for the forced tool. Each subagent gets documents rather than "researching", since no network is used. The code searches for the `tool_use` block and does not assume `response.content[0]`.

## Step 3 — A citation rule helps, and still needs a check

Files: [provenance.js](provenance.js), [results/pipeline.json](results/pipeline.json)
Both versions ran on the same findings, to test whether the rule makes a difference:

| | Sentences | Uncited | Citation to nothing | Number not in what it cites | Findings dropped, of 16 |
|---|---|---|---|---|---|
| With the rule | 14 | 0 | 0 | 0 | 0 |
| Without the rule | 19 | 19 | 0 | 0 | 16 |

Reading the table:
- **Counting markers is a weak check.** It counts `[n]` markers: 18 for 16 claims here, a "preservation rate" above 100%. A report with swapped citations scores perfectly. A URL-anywhere check is weaker still. Offline checks prove both are fooled by a report in which the real check finds each number mis-cited.
- This check maps each sentence to its claims: it extracts numerals from the sentence and looks for them in the cited claim, excerpt or date. It does not understand meaning. A sentence with no numeral and a wrong citation passes, and a spelled-out number such as "two gateways" is not compared. So it catches wrong figures, not every wrong claim.
- The references section is built by code from the mappings, so a URL cannot be altered in synthesis.
- **The rule did not hold every time.** A second live run with the rule, from the viewer check and not saved in results/, had 2 uncited sentences of its own framing: "Adoption rose between two surveys." and "The findings give different values for migration budget and duration...". It dropped no finding and misattributed nothing, and the check caught both. So a prompt rule is not a guarantee, and this is why the check runs after synthesis. In that run the model also did say that the values differ. Two runs in all with the rule.
- **Again after the rewording:** a live run on 2026-11-01 with the current prompt had 3 uncited sentences of 17, so the script exited with an error. The other 20 of 21 checks passed. Treat the rule as helpful, and keep the check that catches its misses.
- A forged test failed first and exposed a real bug in my sentence splitter: a sentence starting with a digit did not split. Fixed before any paid run.

## Step 4 — Code finds conflicts in values, not in words

Executed: all 3 known conflicts detected by code, with their real values. The model's attributed report states each value with its own citation. Conflict annotations are added by code, so they cannot be lost.
Grouping is by `measure` and not by comparing claim text, as a text comparison would flag any rewording as a conflict. Explanations are computed from the real date gap: 120 days is offered as a possible trend, and 4 and 8 days are said to need a look at method.
Limits and surprises:
- **Value comparison misses conflicts in words.** "No customer outage was recorded" and "customers reported dropped sessions" are in tension, and code cannot see it, as neither has a value. A check documents this limit.
- Reversed for the model: the report **without** the rule discussed this tension, and asked whether dropped sessions count as an outage. It also noted that the rollout notes predate the patches. The report **with** the rule stated both facts side by side and did not connect them. In the saved run it also gave the duration values without saying they disagree, and only the code's annotation says so. The second run with the rule did state that they differ, so this is variation between runs, and I cannot say the rule caused it.
- Two findings both have the value "Two" for `gateways_patched`, about gateways and vendors. Code treats them as agreeing, while they are not about the same thing.

## Step 5 — Three formats, chosen by a rough rule

Executed: three formats, with citations in every one.
The number test only matches money and percentages, since `\d+\.\d+` and a plain number test fit few real claims. Each format carries a citation, the table included. An unknown type throws, and does not return `undefined`.
Weakness: rule-based detection is rough. The 38% and 61% adoption rates land in the "financial" table, as the rule is about the symbol, and "Teams migrated within six weeks" lands under news. A subagent assigning a type would do better, at the cost of trusting that assignment.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Saved results are the default. A free mode checks a pasted report against the saved findings, with a preset showing the swapped report that the weak URL test passes.

## Takeaways

1. Return structured claims from the first step. Attribution cannot be rebuilt from prose afterwards.
2. Verify each excerpt and number against the named source in code. All 16 passed here, and it took a few lines.
3. Build references and conflict annotations in code, and let the model write only prose, so a mistake there cannot corrupt the record.
4. Do not trust a citation count or a URL-in-text test. Map each sentence to what it cites, and know what your check still cannot see.
5. A citation rule and an analysis request are different. Ask for both explicitly if you want both, and do not expect value comparison to catch disagreements in words.
6. Use publication dates to separate a trend from a contradiction, and say "may". The date gap suggests. It does not prove.
