# 03 Subagents and explicit context: notes

**All steps were run against the live Anthropic API on 2026-10-31** (`claude-sonnet-5-5`, direct
API key). Running them exposed four defects in the first version of this code, all fixed; see the
"Executed" lines below. The scripts then changed; the 2026-11-01 section at the end holds the current results.

---

## Environment notes

- The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) spawns a real Claude Code CLI
  subprocess per `query()` call. Left to inherit this repo's own dev environment, that subprocess
  picks up this very session's own MCP servers and auth. Fixed with a minimal, explicit subprocess
  environment; see `env.js`, which since 2026-11-01 uses `_shared/agent-env.js`. Before that it also wrote session files to the real
  `~/.claude/projects`; the folder from those runs is still there.
- Tried switching to Haiku to cut cost. It did not reliably recognise custom subagents passed
  via `options.agents`. Sonnet handled the same call correctly. This was through the former provider. **Not re-tested on the direct API.**
- Asking a subagent to self-report its own tools ("what tools do you have?") is not a valid way
  to verify a `tools` restriction: a live test got a long, generic, fabricated tool list. The only
  trustworthy check is which `tool_use` blocks a subagent actually emits (`step-2-subagents.js`).
- The stream shape differs by how a subagent runs. Background subagents emit assistant messages
  tagged with `parent_tool_use_id`; a foreground subagent's answer may only appear as a `tool_result`
  to the coordinator. `subagentTexts()` in `finding.js` reads both.

---

## Step 1 — Leaving `Agent` out of `allowedTools` did not stop spawning

Built: `step-1-gate.js` runs the same coordinator prompt twice — `allowedTools: ["Read"]` (no
gate) vs `allowedTools: ["Read", "Agent"]` (gate open) — and checks whether a subagent was
actually spawned.

Files: [step-1-gate.js](step-1-gate.js)

Commonly assumed: `Task`/`Agent` must be in `allowedTools` for a coordinator to spawn subagents.
Executed: yes, live, and **the result contradicts that.** With `allowedTools: ["Read"]`
the coordinator still spawned the subagent. A follow-up run with `permissionMode: "dontAsk"` did the
same, while the subagent's own `WebSearch` call was denied there. The init message lists `Task` among
the available tools in every case. So in the SDK version installed here (`0.3.x`), leaving `Agent` out
of `allowedTools` does not close this gate: `allowedTools` pre-approves tools, it does not define which
tools exist. An earlier run through a different API provider had shown the opposite, so this behaviour
may depend on the SDK version.

Pitfall: do not rely on omitting it as a security boundary; test the restriction you depend on.

## Step 2 — A subagent's tool list holds, judged by what it really calls

Built: `step-2-subagents.js` spawns both subagents for real tasks and inspects which `tool_use`
blocks each one actually emits, keyed by `parent_tool_use_id`.

Files: [step-2-subagents.js](step-2-subagents.js), [agents.js](agents.js)

Executed: yes, live. Web-search called only `WebSearch`, doc-analysis called only `Read`, each matching
its declared list. An earlier version asked subagents to self-report their tools and got a fabricated
list, which is why this script inspects real `tool_use` blocks instead.

Pitfall: `tools` in an `AgentDefinition` restricts what the model is *offered*, not what it
chooses to do with what it's offered — two different failure modes to keep separate. (A related,
adjacent finding from earlier live testing: a `web-search`-equivalent agent, given a real tool and
explicitly told to use it, sometimes answered from its own training knowledge without calling the
tool at all. That's a distinct problem — tool availability enforced correctly, tool *use* not
enforced at all — worth remembering even though it isn't this step's own point.)

## Step 3 — One shape for every finding, parsed defensively

Built: `finding.js` exports `FINDING_SCHEMA` (JSON Schema form of the `Finding` shape),
`parseFinding()` (extracts and defensively normalises a fenced ```json block from a
subagent's free-text reply), `toResearchOutput()` (wraps findings in a `ResearchOutput`),
and `verifyCitations()`/`extractClaims()` for step 5.

Files: [finding.js](finding.js), [step-3-schema.js](step-3-schema.js)

Executed: yes, locally, no API cost. Confirmed: a well-formed web-search reply and a well-formed
doc-analysis reply both parse correctly into the unified `Finding` shape; free text with no fenced
JSON block returns `null` rather than throwing; a `confidence` value outside `"high"|"medium"|"low"`
(a stray `0.7`) is defensively normalised to `"low"` rather than passed through — same principle
as example 02's normalisation layer, applied to a different SDK.

Each subagent's prompt points at the `Finding` shape, since steps 4 and 5 depend on it.

Pitfall: the Agent SDK has no forced-tool-call equivalent to the Messages API's `tool_choice`
(used in example 02) — a fenced-JSON-in-the-system-prompt convention plus defensive
parsing on arrival is the best available substitute, not as strong a guarantee.

## Step 4 — Synthesis can only cite the metadata it was handed

Built: `step-4-synthesis.js` gathers findings from both research subagents, wraps each side's
findings into a `ResearchOutput`, and builds the synthesis prompt around the full
`JSON.stringify(...findings, null, 2)` for each side, embedded in
the prompt, not just extracted claim text.

Files: [step-4-synthesis.js](step-4-synthesis.js), [finding.js](finding.js)

Executed: yes, live, after two fixes. The first run returned an empty report and no doc-analysis
findings, yet still exited successfully: the synthesis answer arrived only as a `tool_result`, and
subagents answered with a JSON array the parser did not accept. A null `page_number` was also being
turned into `0`. After the fixes, both sides returned findings with metadata intact and the report
cited `spectrum.ieee.org` and `sample-report.md, page 3`.

Pitfall: the attribution failure this step is about is mechanical, not a prompting problem —
if metadata isn't in the synthesis subagent's context, no amount of asking it to "cite your
sources" can produce a real citation, because it has no tools of its own to look one up.

## Step 5 — A citation check that can barely fail

Built: `step-5-verify.js` calls `finding.js`'s naive `verifyCitations(report, findings)`, and reports
which sentences in the synthesis report have no matching finding.

Files: [step-5-verify.js](step-5-verify.js), [finding.js](finding.js)

Executed: yes. On the empty report from the first step 4 run it printed "Fully attributed" with 0
sentences checked, a false pass; it now fails on an empty report. On the fixed report: 14 sentences
checked, 0 uncited. Given the defect below, that number is weak evidence on its own.

Pitfall, a specific defect worth naming: `verifyCitations` checks
`report.includes(claim) && report.includes(f.source_url)`. The
first half is always true (`claim` was extracted from `report` by splitting it, so of course
`report` contains it) — it does no work. Worse, for document-sourced findings `source_url` is an
empty string, and `"any string".includes("")` is always `true` in JavaScript — so *every*
document-sourced claim passes this check regardless of whether its `page_number` citation is
actually present anywhere in the report. This function only meaningfully verifies
web-search findings. Kept unchanged rather than silently fixed, because the step's real point
(trace an orphaned claim back to what the coordinator passed, not to the synthesis prompt's
wording) survives the flaw — but it is exactly the kind of gap a careful read should catch.

## Step 6 — Parallelism comes from one response with two Agent calls

Built: `step-6-parallel.js` instructs the coordinator, in one message, to "issue two Agent tool
calls at once" and checks how many `Agent` tool_use blocks land in the coordinator's first
assistant turn.

Files: [step-6-parallel.js](step-6-parallel.js)

Executed: yes, live: 2 `Agent` calls in the coordinator's first response, 18.3 s wall-clock. The first
run reported 1 because the SDK streams each `tool_use` block as its own assistant message; both share
one `message.id`, so the count now goes by that id. There is no
`Promise.all` over subagents; the parallelism comes from steering the coordinator through its prompt.

Pitfall: sequential spawning of independent subagents (no data dependency between them) is a
pure latency cost with no correctness benefit — the two round trips add instead of overlapping.

---

## `coordinator.js` — the final combined shape

Rebuilt as one continuous `query()` session with all three agents (`web-search`, `doc-analysis`,
`synthesis`) registered up front and a single natural-language instruction covering parallel
research then attributed synthesis — matching step 6's refactored shape rather than the two
separate `query()` calls the file started with. Used by `viewer.js`/`ui.html`.

### Later fixes, from real runs against a genuinely blocked WebSearch tool

The block was a policy of the former API provider. On the direct API, WebSearch works, so the retry and partial-failure
behaviour below has not been seen again; it would need a tool that fails on purpose. Three live runs surfaced real behaviour worth recording:

1. **WebSearch retried 4 times against the same policy error.** Added an explicit "if the search
   tool errors, do not retry — report and stop" instruction to `WEB_SEARCH_AGENT`'s prompt.
   Confirmed down to 2 attempts on the next run (not 1 — the model still tries once more before
   accepting the instruction, which is itself worth knowing rather than assuming a prompt
   instruction produces exactly the described count).

2. **doc-analysis burned 8 Grep calls before 2 Read calls on a three-paragraph file.** Added "the
   document is short, read it directly, don't search it first." Confirmed down to a single Read.

3. **The coordinator skipped synthesis entirely on partial failure.** With web-search blocked and
   doc-analysis successful, a live run's "final report" turned out to be the web-search
   subagent's own failure message, verbatim — synthesis was never spawned at all (only two
   `parent_tool_use_id` groups appeared in the transcript, not three). The original prompt only
   described the happy path ("once both return, pass their findings to synthesis"); it never said
   what to do if one side came back empty, and the coordinator model's own judgement was to abort
   rather than synthesise a partial report. Fixed by making the instruction explicit: spawn
   synthesis regardless, with whatever findings exist, and have it name the gap.

   This also exposed a latent bug in how `coordinator.js` identified whose text was whose: it
   guessed the source agent from text content (does it mention `"document_name"`? does it contain
   a URL?), and treated "the last non-JSON text block seen" as automatically being synthesis's
   report — which is exactly how the web-search subagent's own failure prose got mistaken for the
   final report. Replaced with a real identification: the coordinator's own `Agent` tool_use
   blocks carry `input.subagent_type`, captured by `tool_use_id` when the coordinator spawns each
   subagent, then looked up by `parent_tool_use_id` for every message that subagent produces. Text
   is only ever treated as the report when it demonstrably came from the `synthesis` agent.

## 2026-11-01 — Rework on the direct API

Ran, final form, one after another, `claude-sonnet-5-5`, `@anthropic-ai/claude-agent-sdk` 0.3.226. Costs are the SDK's `total_cost_usd`.

| Script | Checks | Cost |
|---|---|---|
| `step-1-gate.js` | 6 of 6 | $0.3698 for four configurations |
| `step-2-subagents.js` | 5 of 5 | $0.1041 |
| `step-3-schema.js` | 9 of 9 | free |
| `step-4-synthesis.js --force` | 7 of 7 | $0.3635 ($0.2346 research, $0.1289 synthesis) |
| `step-5-verify.js` | 10 of 10 | free |
| `step-6-parallel.js` | 4 of 4, 16.4 s | $0.2235 |
| `step-7-coordinator-offline.js` (new) | 7 of 7 | free |

Total $1.06. **The full coordinator was not re-run**, to avoid another $1.12. `coordinator.js` gained an injectable query function, a $2 budget above the
shared $1 cap, and an error event on an empty report, and it now uses the new isolation. Its stream reading is tested by the scripted step 7 only. The
last live coordinator run is 2026-10-31, before these changes. **Unverified:** that the final form completes live, and that the $2 cap is enough.

Re-running is now free: steps 1, 2 and 6 save to `results/`, step 4 to `step-4-results.json`, and a new paid run needs `--force`. With the API blocked, all four read
their saved data and passed.

### `allowedTools`, as observed

| Configuration | Spawned | Spawn tool on offer |
|---|---|---|
| `allowedTools: ["Read"]`, bypass mode | yes | yes (`Task`) |
| `allowedTools: ["Read"]`, `permissionMode: "dontAsk"` | yes | yes |
| `allowedTools: ["Read", "Agent"]`, bypass mode | yes | yes |
| `allowedTools: ["Read", "Agent"]`, `disallowedTools: ["Agent", "Task"]` | no | no |

Commonly assumed: `allowedTools` is the hard gate. Measured here: leaving `Agent` out pre-approves nothing, but the tool stays available. Under `dontAsk` the
spawn still went through, and the subagent's own WebSearch was denied, so the subagent found nothing. `disallowedTools` is what closed the gate. The checks pin this
behaviour, so a later SDK that changes it fails the script. The disallowed arm is my addition, and a dontAsk arm joined it, so the script records what the earlier follow-up
only described. An earlier run through a former provider showed the opposite, on a version not recorded. One run each.

### Other changes

- `env.js` now uses `_shared/agent-env.js`: a throwaway config directory, no session on disk, a budget cap. No new session file appeared under `~/.claude/projects` for these runs.
- **`verifyCitations` cannot do the job.** On a forged report it passes claims whose document page is not cited, and step 5 now pins that defect. The verdict moved to `verifyAttribution`: every finding's
  source is cited, every figure comes from a finding, every paragraph with a figure has a citation beside it. Four forged reports prove it can fail.
- Step 4 now also checks that each cited URL is in what the search tool returned, that a document claim's figures are on its cited page, and that the prompt synthesis really received held the metadata. That last one matters,
  since the coordinator model retells the task and could drop it. This run it kept it.
- Step 4's hardcoded `2026-08-09` timestamp, a false date on the 2026-10-31 data, is now the real run time. That earlier result was replaced by the new one.
- Step 6 now checks that subagent activity overlapped in time. It did: 3.8-13.1 s and 5.1-6.7 s. It still does not measure a sequential run.
- The page's cost label said "synthesis call cost" but showed the whole run, so it now says "cost of this run".
- `mock-search.js` is unused; its comment no longer claims a current policy.

Viewer: the page returned 200, and `stub=1` ran `coordinator.js` through the real server and SSE at no cost, with `start, subagentToolUse, finding, report, runSaved`. This checks the route and the event contract, **not a live run**. The button on the page always starts a real run.

Limits: `verifyAttribution` cannot tell whether a sentence without a figure matches its source. The search URL check confirms the URL was returned, not that the page says what the claim says. All results are single runs.

## Takeaways

1. Do not use `allowedTools` to stop an agent spawning subagents. Here it did not. Use `disallowedTools`, and test the restriction you rely on, under the permission mode you will really use.
2. Pass context explicitly. A subagent knows only its prompt, so put the task, the scope and the data with its metadata in it.
3. Keep the claim and its source in one structure, so stripping the source is a visible act. Then check what the next agent actually received, since a coordinator model retells the prompt.
4. If a claim has no source at synthesis, look first at what the coordinator passed. A subagent without tools cannot recover it.
5. Verify attribution with forged reports as well. A citation check that cannot fail looks exactly like one that passes.
6. Spawn independent subagents in one response when latency matters, and verify with timing. No data dependency means no reason to wait. Multi-agent runs are expensive, though: about $0.10 to $0.40 per small run here, and about $1 for the full one.
7. Judge a subagent's tool scope from its `tool_use` blocks, never from what it says about itself. A scoped tool can still go unused, and a denied tool produces a report, not a crash, so handle that outcome in the coordinator.
8. Cap the budget of every spawned run and set it with the real cost in mind: the shared $1 cap sits below one full coordinator run.
9. Isolate the subprocess. Without a throwaway config directory, these runs wrote to the real `~/.claude`.

Latest full run: 2026-11-01, after the rewording, 16 findings and 18 cited URLs in the report, $1.78.
