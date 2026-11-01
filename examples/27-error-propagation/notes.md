# 27 Error propagation: notes

All failures are **simulated**, from a plan per topic in [mock-database.js](mock-database.js). Topic 1 and 2 quote `_fixtures/research.js`; the rest is invented. The one model call is the synthesis, on `claude-haiku-5-5`, 2026-10-31, $0.0006 at list price. The subagent is a plain function, so no live coordinator or Agent SDK run is involved.

**Short version:** failed access and valid empty stay apart in code. Structured propagation kept 7 sources and reported 4 gaps; silent suppression kept 1 and reported none, and termination kept 0. The real surprise came from the model: its report contained an invented topic, and it answered a topic whose search was empty, using a document retrieved under another topic.

## Step 1 — A schema that can state success and partial failure

Files: [errors.js](errors.js), [step-1-3-subagent.js](step-1-3-subagent.js)
Executed: part of 21 of 21 checks.
A JSON schema, since this repo is plain JavaScript. `status` includes `success`, so that a clean result has a value of its own. A small check function rejects "search unavailable" and a `partial_failure` holding nothing.

## Steps 2 and 3 — Empty is not failed, and retries stay local

Files: [subagent.js](subagent.js), [step-1-3-subagent.js](step-1-3-subagent.js)
Executed: 21 of 21 checks, no API cost. Real backoff measured with a clock: 7,018 ms for waits of 1, 2 and 4 s.
Each of these avoids a defect that a naive retry helper has:
- A loop of 3 attempts ends with a useless 4 s wait after the last. "3 retries" here means 4 attempts and no final wait.
- Retrying everything and labelling every failure transient hides the cause. A permission, business or validation failure now stops at once and keeps its type. Checks confirm 1 database call each.
- Partial results can double-count a source returned twice. Here they dedupe on source: attempts yielding {1,2} and {2,3} give 3, not 4.
- `partial_failure` is set whenever partial data exists, and not a blanket `error`.

## Step 4 — The coordinator acts on each failure type

Files: [coordinator.js](coordinator.js), [step-4-coordinator.js](step-4-coordinator.js)
Executed: 16 of 16 checks, no API cost. Nine topics, each with a different path; all listed in the viewer.
Design points:
- Decisions really run: an alternative source, a narrower range, a corrected date. Returning a decision alone would change nothing.
- A `tried` set and a round cap stop the coordinator repeating itself. Once exhausted, it proceeds with a gap.
- An unknown failure type goes to a person. A `switch` falling through to `undefined` would be a silent failure in the exact code meant to prevent those.
- The threshold of 3 partial sources, `MIN_PARTIAL_SOURCES`, is an arbitrary number. Whether 3 is enough depends on the task.

Comparison added for the two anti-patterns, on the same simulated failures:

| Approach | Sources kept | Gaps reported |
|---|---|---|
| Silent suppression | 1 | 0 |
| Termination on first failure | 0 (1 retrieved, thrown away) | fails with an error |
| Structured propagation | 7 | 4 |

The gap between these figures depends on the failure mix I chose, so the direction is the finding, not the sizes.

## Step 5 — Code computes coverage, and the model tested the check

Files: [synthesis.js](synthesis.js), [step-5-coverage.js](step-5-coverage.js), [results/synthesis.json](results/synthesis.json)
Executed: 19 of 19 checks, one real synthesis. Coverage is computed by code, and six forged reports are all caught.
**A clean empty result must not be filed as "unavailable"**, the same confusion that step 2 exists to prevent, so a fourth state, `no-evidence-found`, exists. A forced tool call needs Haiku 5.5, because Sonnet 5.5 returns 400 for it.

What the model really did. 7 findings: 6 accepted, 3 of those flagged, 1 rejected.
- It invented a seventh "topic" named `gaps in coverage`, with no source, restating the failures. Well meant, but not a finding. The code rejects it, and the code's coverage reports the same gaps properly.
- **It answered the empty topic.** The `customer outages` search returned nothing, but it cited another topic's rollout notes: "No customer outage was recorded." This is correct and useful, and my first check treated it as a failure, on the assumption that each topic owns its sources. The check was wrong, and it now accepts a source retrieved anywhere in the run, and flags it. So "no-evidence-found" means this query found nothing, and not that nothing is known.
- It noticed on its own that "six weeks" and "eight weeks" differ between two documents. The mock data had this by accident.
- No claim on the three failed topics.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Saved results are the default; other modes rerun the simulation, free, with real waits.

## Takeaways

1. Keep "the query ran" and "the query found something" as separate facts. A status of success with an empty list is a valid answer and is never retried.
2. Retry inside the subagent, for transient failures only, and keep what each attempt gathered. Do not repeat a permission failure.
3. Let code compute coverage. A model will happily phrase gaps, and may invent a section for them.
4. Check a synthesis against what was retrieved, and test that check with forged reports. Mine was wrong the first time, and it failed on a correct finding.
5. A gap can be reported truthfully and still be incomplete: one search coming back empty does not stop another topic's source from answering it.
