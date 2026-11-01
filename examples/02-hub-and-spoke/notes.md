# 02 Hub-and-spoke orchestration: notes

## Step 1 — The hub owns the plan, and must know its subagents from the start

Built: `runCoordinator(topic)` with a system prompt defining the hub role, a registry of subagent
definitions, and a structured report object whose empty fields map to the later steps. The framing
("brief") is produced through a forced tool call rather than parsed from prose.

Files: `client.js`, `coordinator.js`, `step-1-coordinator.js`, `viewer.js`, `ui.html`

**A mistake in the first version:** subagents were deferred entirely to step 3. Wrong: selecting a
subagent per subtopic is a coordinator responsibility, and it can only select from what it knows
exists. Registration belongs in the setup, invocation in step 3. Fixed — `SUBAGENTS` added, exposed as
`availableSubagents` in the report. The coordinator is a set of module-level functions.
The forced-tool brief makes the system prompt observably in effect and gives the viewer something
real at step 1.

Pitfall: decomposition, subagent selection and aggregation belong to the coordinator — **not** the
subagents. If output comes back incomplete, look at how the coordinator split the work; improving the
subagent is the wrong first move.
Second pitfall: subagents are isolated. No shared memory, no inherited context, no sight of the
original request. Any gap in the brief becomes a gap in the result.

## Step 2 — Listing and auditing are different searches: a second pass finds the blind spots

Built: Two-phase decomposition. Phase A enumerates categories (names only). Phase B asks the
opposite question — what is MISSING from that list — then produces the final subtopics. Schema
carries `missingFromFirstPass` and `omittedOnPurpose` so gaps and deliberate exclusions are visible
rather than silent. Minimum of 5 enforced via `minItems` plus a loud code-side check (no retry —
that is step 5).

Files: `coordinator.js`, `step-2-decompose.js`, `ui.html`

**A mistake in the first version:** it was single-phase, with one strong prompt. Rebuilt as
two phases, and the effect is large: phase B added 12 areas the first pass had missed, including
explicitly contested ones ("Space-Based Solar Power (contested/emerging)", "Nuclear power's
relationship to renewables debate"). Producing a list and auditing a list for absence are different
searches; only the second one finds blind spots.

Design choice: a forced tool call, not `JSON.parse(response.content[0].text)`. That line would be both
the `content[0]` anti-pattern example 01 warns about and prose-parsing where a forced tool call would
guarantee structure. Subtopics are `{title, scope}` objects rather than bare strings.

Result: 17 subtopics. Five of the six target categories are covered — solar, wind,
geothermal, tidal, biomass. **"Fusion" never appears by name**, in any run. `omittedOnPurpose`
explains why: the model classifies nuclear/fusion as not renewable "per the topic definition". A
defensible domain judgement, not lazy decomposition — and it originates in the *brief*, one stage
earlier, whose `breadthNote` never mentions fusion either. After the two-phase rebuild the
contested boundary does surface: subtopic 16 covers "Emerging, Next-Generation, and Contested
Technologies" including nuclear's contested relationship. Deliberately not hardcoding "fusion" into
the prompt — that would encode the answer key instead of the principle. Left open to see whether
step 4's coverage assessment catches it.

Bugs found in my own code while building this, all worth remembering:

1. **`required` in an `input_schema` is not enforced.** `missingFromFirstPass` was listed as
   required and came back absent; the code crashed on `.length`. Fields must be defaulted on
   arrival, never trusted because the schema demanded them.
2. **A `max_tokens` truncation produced an empty tool input, not an error.** Phase B silently
   returned zero subtopics. The `tool_use` block was there — just cut off mid-serialisation.
   This is exactly example 01's pitfall in the wild: I had not checked `stop_reason` before reading
   the payload. Added a guard that throws on `max_tokens` and on a missing `tool_use` block.
3. **A field can come back in the wrong SHAPE, and `?? []` does not catch that.** A default only
   fires on null and undefined; an object or a string passes straight through into code expecting
   an array (`report.subtopics.entries is not a function`). Fixed with a normalisation layer:
   `asArray` recovers array-like objects keyed `"0"`, `"1"`, …, `asStringList` tolerates objects
   and blanks, `normaliseSubtopics` drops malformed entries with a warning and **throws** when
   nothing usable is left — an empty decomposition would otherwise produce a confident, empty
   report. Pinned by `normalisation.test.js` (now 12 shape tests, no API calls, milliseconds).

4. **The model sometimes nests the ENTIRE tool input into the first field as a JSON string.**
   Roughly every other run on a large decomposition:
   `{ subtopics: '{"subtopics":[…],"missingFromFirstPass":[…],"omittedOnPurpose":"…"}' }`.
   Every value present and correct — one level of wrapping wrong. Intermittent, not topic-specific:
   the same prompt succeeds and fails across consecutive runs. Fixed by `unwrapDecomposition()`,
   which parses that string and merges it back. A truncated nested payload is deliberately left
   alone rather than half-parsed. Verified over five consecutive runs, all clean. All of this was through the former provider:
   it did not recur in the 15 decompositions of the 2026-11-01 rework, which ran on another model. The guard stays, since it costs nothing.

   The general rule behind all four: **`required` and `type` in an `input_schema` are hints to the
   model, not validation of the response.** Validate every field on arrival — presence *and* shape.
   Forcing `tool_use` removes syntax errors from the output, and these four findings show that errors
   of meaning and shape remain.

Pitfall: when output is incomplete, start with the coordinator's decomposition, not the
subagents. Proof from this run: the gap existed before a single subagent had been written.
Second pitfall: breadth is not achieved by asking harder in one pass. It is achieved structurally, by
a separate validation pass that searches for absence.

## Step 3 — What a subagent knows is exactly what its brief says

Built: `buildSubagentBrief()` assembles everything a subagent will ever know into one prompt —
overall topic, goal, its own subtopic and scope, the sibling subtopics owned by other agents, and
the findings already established. `runSubagent()` runs it with the agent's own system prompt and a
forced `submit_findings` tool. Two subagents, sequential: web search takes subtopic 1, document
analysis takes subtopic 2 and receives the first agent's findings as prior context.

Files: `coordinator.js`, `step-3-delegate.js`, `ui.html`

Two pieces of evidence from the run, both stronger than the assertion they support:

1. **The subagents proved their own isolation.** The first version of the brief said "other
   subtopics are covered by other agents" without naming them. The wind agent then routed
   something out of scope "to a broader 'grid integration' subtopic **if one exists**". It did
   exist — subtopic 9. The agent could not tell the difference between "someone has this" and
   "nobody has this", so it hedged, and the coordinator got a routing note it could not act on.
   Added the sibling roster to the brief; the out-of-scope notes now name the target subtopic
   exactly: "belongs to 'Manufacturing, Supply Chains, and Critical Materials'".

2. **The control run failed harder than expected, at the time.** (On the direct API it behaved differently; see the 2026-11-01 section.) Same agent, same subtopic, brief stripped to
   the bare title. It did not return weaker findings — it returned *none*, and asked for the
   documents: "Each conversation starts fresh, so even if you shared documents with me previously,
   I won't retain them." The subagent articulated its own isolation better than any comment could.
   The failure of a context-starved subagent is not lower quality, it is a request for information
   the coordinator was supposed to supply.

The brief holds four elements — assigned subtopic, broader research goal, expected output format,
prior findings. A subagent cannot be assumed to know anything else, which is why the sibling roster
belongs there too.
Confidence: each finding carries a 0.0–1.0 number (and the `Finding` schema in example 03 has a
confidence field too). Raw self-reported confidence is uncalibrated and must never drive automated
routing — carry it for human triage, never branch on it untested.
Design choice: a forced tool call guarantees the shape, rather than asking for structured findings in
prose. Forcing a tool now needs a model that accepts it; see the 2026-11-01 section.
Observed: with no real search tool, the agents report 0.5–0.7 confidence on recalled figures.
Honest, and exactly what an uncalibrated-but-truthful signal should look like.

Pitfall: when a subagent produces poor or empty results, check what the coordinator put in its
prompt before touching the subagent. A better system prompt, more tools or a stronger model would
not have fixed this. Neither agent here was better than the other; the brief was.
Second pitfall: "explicit context passing" includes what the subagent must *not* do. Scope boundaries
and the sibling roster prevent duplicated work as much as the goal prevents drift.

Correction after review: the first build silently delegated only the first two subtopics. One call
per subtopic gets expensive at 30+ subtopics — but the cap was **invisible in the output**, which is
the actual defect. A coordinator that covers 2 of 37 subtopics and hands back a confident report has
not produced a partial answer, it has produced a misleading one. Replaced with `maxDelegations`
(default 2, adjustable in the viewer), round-robin across the available subagents, and a
`delegationPlan` event that names every subtopic left uncovered. **No silent caps** — if a system
bounds coverage, the bound has to appear in the output.

Open observation for step 4: the two-phase decomposition now over-produces — 13 to 37 subtopics
depending on the topic, against a required minimum of 5. Breadth and tractability pull in opposite
directions, and nothing in the pipeline yet consolidates. Coverage assessment is where that has to
be dealt with.

## Steps 4–6 — Coverage is counted in code, and a missing category has a location

**Step 4 — aggregate and assess coverage.** `evaluateCoverage()` builds a per-subtopic map from the
findings: `missing` (no findings), `partial` (fewer than 3 findings, or mean confidence below 0.5),
`covered` otherwise. `completeness = covered / total` — partial deliberately does not count, since
a subtopic with one thin finding is a gap with something in it.

Deliberately **programmatic, not a model call**. "Which subtopics have substantive findings" is a
counting question, and asking a model to grade its own coverage invites the optimism the assessment
exists to catch. Where the answer must be right every time, enforce it in code.

**Step 5 — the refinement loop.** `while (completeness < 0.9 && rounds < maxRounds)`, re-delegating
only the gaps, never the covered subtopics. Two bounds, and the distinction is the same one from
example 01: the **threshold** is the real stop condition, the **round limit** is the safety net.
A per-round gap budget keeps cost sane and is reported, not hidden.

**Step 6 — verification with a diagnostic, not a pass/fail.** `step-6-verify.js` checks each of the
six required categories at three points — decomposed, researched, in the final report — and names
where it was lost. Three failure sites, three different fixes:

| Symptom | Root cause | Fix |
|---|---|---|
| not in decomposition | coordinator never named it | fix the decomposition |
| decomposed, not researched | never assigned to a subagent | fix delegation / budget |
| researched, not in report | dropped during synthesis | fix the synthesis prompt |

First full run: solar, wind, geothermal, tidal, biomass all `ok`; **fusion LOST IN DECOMPOSITION**.

### The fusion finding — the most useful result in this example

Three prompt-level attempts to make the decomposition include fusion all failed:

1. "include the minor, emerging and less glamorous categories"
2. "read the topic inclusively; add contested categories with a caveat rather than dropping them"
3. "name debated, speculative or pre-commercial technologies **by name**, not as a category"

Every run still excluded it, with a reasoned justification: fusion is not renewable by strict
definition. The model is right on its own terms. **Its domain taxonomy is a prior that instructions
about inclusiveness do not move.**

The fix is architectural, not rhetorical: a `scopeNote` parameter through which the *requester*
declares the boundary of a contested topic. It states a rule and never names fusion —
"include every technology proposed as a long-term primary energy source that is not fossil fuel
based, whether or not it meets a strict definition of 'renewable'" — and the model applies it.
Result at the time: all six categories, first try. Calling that stable was wrong; see the 2026-11-01 section.

Final verification run, all six `ok`. Worth noting how fusion got there: decomposed (scope note),
**not** delegated in the first pass (budget of 8 of 26), then picked up by the refinement loop,
which chose "Nuclear Fusion, Space-Based Solar Power" as its round-1 targets, and finally written
into the report. Every stage of the pipeline did its own job.

Pitfall: when a category is missing from the output, the answer is not "improve the subagent".
Trace the three sites in order — decomposition, delegation, synthesis — and fix the one that lost
it.
Second pitfall: coverage assessment belongs in code. A model asked whether its own work is complete
is not a check.
Third pitfall: prompt phrasing cannot override a model's domain judgement. Where a boundary is
contested and consequential, supply it as data. This is the same principle as the programmatic gates
in example 04 — a prompt is a request, a parameter is a fact.

## Later fix — the viewer silently forced 0 refinement rounds

Found from a real run (`_runs/02-hub-and-spoke_2026-08-08T20-14-36-855Z.json`, completeness
10.5%) that looked fine in the UI. It looked fine because the coverage-limitations
section was honest — the underlying cause was not.

`ui.html` never sent a `rounds` parameter, and `viewer.js` read the missing param as
`Number(params.get("rounds")) ?? undefined`. `Number(null)` is `0`, not `null`/`undefined`, so `??`
never applied the fallback — every web-UI run silently passed `maxRefinementRounds: 0`, skipping the
refinement loop entirely regardless of topic or delegation budget. Invisible from the terminal step
scripts because they call `runCoordinator` directly and never go through this parsing.

Fixed by reading params on presence, not on coerced value: `params.has(key) ? Number(...) : undefined`
instead of `Number(...) || undefined` / `?? undefined`. This also makes `rounds=0` usable as a
deliberate way to trigger the round-limit trap from the UI, which a value-based fallback could never
allow (`0` would always collapse back to the default). Added a "Refinement rounds" input to `ui.html`
so the parameter is visible and controllable, not just correctly defaulted.

General rule: **a parameter default that coerces "absent" through a numeric cast is not the same as
"absent."** `Number(null) === 0`, `Number("") === 0` — both are valid, non-nullish numbers, so `??`
silently accepts them as the real value. Check presence (`URLSearchParams.has`, `"key" in obj`) when
zero is a meaningful, distinct setting from "not provided."

## 2026-11-01 — Rework on the direct API

Everything above describes the first build, through a former API provider, and its counts are history.

**The example did not run as it stood.** A minimal call confirmed it: forced `tool_choice` on `claude-sonnet-5-5` returns a 400,
"tool_choice: type "tool" and "any" are not supported for this model", and `claude-haiku-5-5` accepts it. The brief, both
decomposition phases and the subagents now run on `FORCED_TOOL_MODEL` (Haiku 5.5). The written report stays on Sonnet 5.5. So the
findings below come from a different model than the first build, and the two are not comparable.

Ran, final form, one after another, `@anthropic-ai/sdk` 0.116:

| Script | Checks | Computed cost |
|---|---|---|
| `normalisation.test.js` | 12 of 12 | free |
| `step-1-coordinator.js` | 7 of 7 | $0.0723 |
| `step-2-decompose.js` | 6 of 6 | $0.0674 |
| `step-2-stability.js` (new) | 4 of 4, fusion in 5 of 5 runs | $0.0097 |
| `step-3-delegate.js` | 10 of 10 | $0.0426 |
| `step-6-verify.js` | 7 of 7: all six categories ok, 96% of 23 subtopics, 157 findings | $0.2548 |

Getting there took more paid runs: step 1 $0.139, step 2 $0.119, step 3 $0.079, and step 6 three more times: once $0.278, once
stopped by `max_tokens`, cost not recorded, and once killed by a time limit I set too short, also not recorded. Total for this example
about $1.1 measured, plus those two unrecorded runs, which I estimate at about $0.3 together. Costs are computed from tokens and
list prices, not billed amounts.

What really happened:

- **Fusion was not stable.** The earlier "stable" claim is false. With the scope note, one full run on Haiku excluded fusion, saying it
  "should be considered by the requester". The new check caught it and step 6 exited 1. Cause: `scopeNote` only reached phase B, so the
  first pass still used the model's own boundary. It now reaches phase A too, and a five-run measurement kept fusion every time, in phase A and
  as a subtopic. That measurement used a fixed goal and skipped the brief call, which still does not get the note. Five runs are not proof.
- **Without a scope note fusion stays out.** Step 1's omission note says nuclear is excluded as non-renewable. That part still holds.
- **The context-free control behaved differently.** It no longer returned nothing. Both runs said no documents were attached and then gave general
  points without sources. So a starved subagent can also return plausible unsourced content, which is harder to notice than a request for input.
- **Step 6's check was too weak.** A category named only under "Coverage limitations" counted as reported. That section no longer counts.
- **The report overflowed at 16,000 tokens** on a full run. The stop guard caught it. Each section is now limited to 120 words.

Other changes: checks in every step script; `toolInput` guards the brief too; a report not ending on `end_turn` throws; usage and cost on the report; a
`refinementLog` so "only gaps were re-delegated" can be checked; step 3's control now runs on the same model as the subagents, as otherwise the
model would differ as well as the brief; step 6 now delegates every subtopic, as coverage otherwise depended on where a category fell in the list.

Viewer: the page returned 200, and one live run through the server (`topic=tidal energy, maxDelegations=1, rounds=0`) gave the whole event sequence
to `report`, 1 of 28 subtopics delegated and 27 named as uncovered, $0.0261.

Not verified: the subagents have no search tool, so their "sources" are recalled by the model and nobody has checked them. Coverage counts findings, not
whether they are true. The brief call has no scope note. Decomposition size varied from 17 to 55 subtopics, and nothing consolidates it.

## Takeaways

1. Use a hub only when a task really splits into parts that can be briefed separately and then checked for gaps. A fixed pipeline does not need one.
2. When output is incomplete, trace it in order: decomposition, delegation, synthesis. Fix the stage that lost it, not the subagent by default.
3. If the boundary of a topic is a decision, make it an input and pass it to every stage that shapes the scope. A rule that reached only the second pass lost the category on one run.
4. Measure a stochastic step more than once before calling it stable. One good run was wrong here.
5. Compute coverage in code, and do not count a topic as covered because the report lists it as missing.
6. State every bound in the output: skipped subtopics, budgets, rounds. Give each loop a real stop condition and a separate limit.
7. Budget by the decomposition. 17 to 55 subtopics mean 17 to 55 subagent calls, and the written report can outgrow its token limit, so make truncation fail loudly.
8. Check that a model feature exists on the model you plan to use. Moving to a newer model removed forced `tool_choice`, and the whole pipeline stopped on its first call. A model split is a fair answer: cheap for structured work, stronger for prose.
9. Do not call an agent "web search" unless it has a search tool. Without one, it cites from memory, and the source field looks just as trustworthy.
