# Error propagation and coverage

Carry each failure upward as structured data, retry transient ones locally, and state in the final output what could not be covered.

## Use when

- Several subagents or data sources feed one result
- One source failing should not end the whole run
- A reader could mistake a missing section for "nothing relevant exists"

## Do not use when

- One call feeds one answer, and a plain error is enough
- Any missing part makes the result useless; then stopping is correct
- A failure is cheap to notice because a person reads the raw output straight away

## Decision

A subagent returns `success` for any query that ran, including one matching nothing, and only then `shouldRetry: false`. It retries only transient failures, with doubling waits, and keeps results gathered between attempts. What survives reaches the coordinator with its failure type, the attempted action, the partial results and the alternatives. The coordinator picks by failure type and caps its own rounds. Code computes the coverage: well-supported, limited, no evidence found, unavailable. Then code checks the model's findings against what was retrieved. See [structured tool errors](structured-tool-errors.md) for the tool-level part.

Guidance, not verified by a run here: write down what the coordinator should do when one subagent fails. If its prompt describes only success, it may give up on the whole run, so tell it to carry on with the results it has and to name what is missing.

## Trap

Filing a clean empty result under "unavailable" merges the two things this pattern keeps apart. Retrying without regard to type repeats calls that must fail. Separately, a source check that demands each topic own its sources rejects correct findings: a model may correctly answer an empty topic from a document found under another. Flag such a case instead of rejecting it. And "no evidence found" means this query found nothing, not that nothing is known.

## Example

[subagent.js](../examples/27-error-propagation/subagent.js): retry, and empty vs failed.
[coordinator.js](../examples/27-error-propagation/coordinator.js): recovery, coverage, and the findings review.
[step-5-coverage.js](../examples/27-error-propagation/step-5-coverage.js): checks against forged reports.

## Verified

2026-10-31, simulated failures on nine topics, and one synthesis on `claude-haiku-5-5` with `@anthropic-ai/sdk` 0.116. Real backoff of 1, 2 and 4 s took 7,018 ms. On the same failure plan, structured propagation kept 7 sources and reported 4 gaps, silent suppression kept 1 and reported 0, and termination kept 0. Of 7 model findings, 6 were accepted, 3 of them flagged for a cross-topic source, and 1 rejected for an invented topic with no source. Six forged reports were all caught.

## Usual advice vs observed

The expected model failure is losing attribution or claiming on failed topics. Here it made no claim on the failed topics, but it did add an unsourced "gaps" section of its own, and it answered an empty topic from another topic's document, correctly. Both only appeared because a check compared the output with what was retrieved.
