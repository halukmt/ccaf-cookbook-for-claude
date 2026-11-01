# Claim-source provenance

Carry each claim with its source through every pipeline step, verify the mapping in code, and show disagreements instead of settling them.

## Use when

- Several sources feed one written output, and readers must be able to check it
- A wrong or untraceable statement has a real cost: research, compliance, finance
- Sources can disagree, or age at different rates

## Do not use when

- There is one source, and the output quotes it directly
- The output is a draft that a person verifies against the sources anyway
- Claims are opinions or creative work with nothing to trace

## Decision

Have each research step return structured claims: claim, source URL, document name, word-for-word excerpt, publication date. Check every field against the named document in code, before anything is merged. Number the claims. Let the model write prose with `[n]`, and build the reference list and conflict annotations in code. Then check each sentence against what it cites. Add a value and a measure to claims where comparison matters. On differing values, keep both with dates, and offer the date gap as a possible explanation, not as a verdict.

## Trap

Checks that look for a URL anywhere, or that count citation markers, pass a report in which every number is cited to the wrong source. Even mapping sentences to sources only tests what code can compare: numbers. A wrong claim with no numeral, or two facts in tension with no shared value, gets through. A citation rule in a prompt is also no guarantee: in one of two runs, it left 2 framing sentences uncited, which only the check after synthesis caught. And a cited report may list conflicting facts without saying they conflict, so ask for that separately.

## Example

[provenance.js](../examples/30-source-provenance/provenance.js): mapping check, sentence check, conflicts, rendering.
[step-1-offline.js](../examples/30-source-provenance/step-1-offline.js): the checks shown forgeries, including one the URL test passes.
[step-2-5-pipeline.js](../examples/30-source-provenance/step-2-5-pipeline.js): the live pipeline.

## Verified

2026-11-01, `claude-haiku-5-5` for structured subagents, `claude-sonnet-5-5` for synthesis, `@anthropic-ai/sdk` 0.116, one run. 16 of 16 mappings verified against their sources. With a citation rule: 0 of 14 sentences uncited, 0 numbers unsupported, 0 of 16 findings dropped. Without it: 19 of 19 uncited. All 3 planted numeric conflicts were detected in code, with both values kept, and the 120-day gap was offered as a possible trend. A swapped-citation report passed the marker count and URL test, and failed the sentence check. A second live run with the rule left 2 of its sentences uncited, and the check caught them.

## Usual advice vs observed

It is usually said that synthesis destroys attribution unless told otherwise. Formally true here: no citations without the rule. Yet that report still named sources in words, kept all conflicting values, and spotted a disagreement in wording that neither the code nor the cited report did. Attribution and analysis are separate requirements.
