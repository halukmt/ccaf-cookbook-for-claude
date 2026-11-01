// Step 1 — The coordinator: the hub of a hub-and-spoke architecture.
//
// Hub-and-spoke means every message goes through the centre. Subagents never talk to each other,
// never share memory, and never see the original request. The coordinator owns three jobs:
// decomposing the topic, selecting and briefing subagents, and aggregating what comes back.
//
// It grows step by step: step 2 adds decomposition, step 3 the subagents, step 4 aggregation,
// step 5 the refinement loop. This step builds the hub itself and the shape of what it returns.

import { addUsage, estimateCost } from "../../_shared/pricing.js";
import { client, FORCED_TOOL_MODEL, MODEL } from "./client.js";

// Every call goes through here so the report can state what the run really used. Calls that force a
// tool use FORCED_TOOL_MODEL, because forced tool_choice returns a 400 on MODEL.
async function createMessage(report, params) {
  const response = await client.messages.create(params);
  addUsage((report.usage[params.model] ??= {}), response.usage);
  return response;
}

// Computed from real tokens and documented list prices. An estimate, not a billed amount.
export function reportCost(report) {
  return Object.entries(report.usage).reduce((sum, [model, usage]) => sum + estimateCost(model, usage), 0);
}

// The system prompt is where the hub role is defined. The last line is the one that matters most:
// a coordinator that starts researching on its own stops being a hub and becomes just another
// agent — and then nothing is left to notice the gaps in its own coverage.
export const COORDINATOR_SYSTEM_PROMPT = `You are a research coordinator — the central hub of a
hub-and-spoke multi-agent system.

Your responsibilities, and only these:
1. Decompose a broad research topic into distinct subtopics that cover its full breadth.
2. Select the right subagent for each subtopic and give it everything it needs to work.
3. Aggregate what the subagents return and judge whether the coverage is complete.
4. Re-delegate for whatever is missing, until the topic is genuinely covered.

You never research a subtopic yourself, and you never let a subagent decide what to investigate.
Subagents are isolated: they share no memory with you or with each other and know nothing beyond
what you put in their prompt. Any gap in your brief becomes a gap in their result.`;

// The roster of spokes. Registered here in the setup, not invented later: selecting the right
// subagent per subtopic is one of the coordinator's three jobs, and it can only select from what
// it knows exists. Step 3 spawns them; this step declares them.
//
// Each definition carries its own system prompt because subagents are isolated — theirs is the
// only standing instruction they ever get.
export const SUBAGENTS = [
  {
    name: "web_search_agent",
    description:
      "Searches the open web for facts, figures, current developments and public reporting. " +
      "Returns findings with source URLs.",
    systemPrompt:
      "You are a web research specialist. Investigate exactly the subtopic you are given and " +
      "nothing beyond it. Return concrete facts and figures, each with its source URL.",
  },
  {
    name: "doc_analysis_agent",
    description:
      "Reads and analyses documents provided to it — reports, papers, filings. " +
      "Returns findings with page references.",
    systemPrompt:
      "You are a document analysis specialist. Analyse only the documents and the subtopic you " +
      "are given. Return findings with the page or section each one came from.",
  },
];

// Forcing a tool call is how a *structured* report is guaranteed. Free prose would have to be
// parsed, and parsing model prose is exactly the fragility this architecture avoids.
const BRIEF_TOOL = {
  name: "submit_brief",
  description:
    "Record the coordinator's framing of the research task before any delegation happens.",
  input_schema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "One sentence stating what a complete answer to this topic would deliver.",
      },
      breadthNote: {
        type: "string",
        description:
          "One sentence naming the dimensions along which this topic could be split — " +
          "technologies, regions, time periods, stakeholders, and so on. Do not list subtopics.",
      },
    },
    required: ["goal", "breadthNote"],
  },
};

// Step 2 — decomposition.
//
// This is the single highest-leverage moment in the whole architecture. Whatever the coordinator
// fails to name here can never appear in the final report, because no subagent is ever asked
// about it. Incomplete output almost always traces back to this call, not to the subagents.
// Decomposition runs in TWO phases, and the separation is the point:
//
//   Phase A  enumerate the categories.
//   Phase B  ask a different question — what is MISSING from that list?
//
// One call cannot do both. Asked to "list the subtopics", a model produces a list that looks
// complete and moves on; nothing in that task ever forces it to look for its own blind spots.
// Asked "what did this list miss?", it is looking for absence, which is a different search.
export const MIN_SUBTOPICS = 5;

const CATEGORIES_TOOL = {
  name: "submit_categories",
  description: "Phase A — a first-pass enumeration of the topic's major categories.",
  input_schema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        description: "Short category names covering the topic. Names only, no descriptions.",
        items: { type: "string" },
      },
    },
    required: ["categories"],
  },
};

const DECOMPOSE_TOOL = {
  name: "submit_decomposition",
  description: "Phase B — the validated breakdown of the topic into subtopics for delegation.",
  input_schema: {
    type: "object",
    properties: {
      subtopics: {
        type: "array",
        minItems: MIN_SUBTOPICS,
        description: `At least ${MIN_SUBTOPICS} distinct subtopics covering the full breadth.`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short name of the subtopic." },
            scope: {
              type: "string",
              description: "One sentence stating what a complete answer to this subtopic covers.",
            },
          },
          required: ["title", "scope"],
        },
      },
      missingFromFirstPass: {
        type: "array",
        description:
          "Major areas the phase A list failed to cover, now added. Empty array if it was complete.",
        items: { type: "string" },
      },
      omittedOnPurpose: {
        type: "string",
        description:
          "Anything within the topic deliberately left out, and why. Empty string if nothing.",
      },
    },
    required: ["subtopics", "missingFromFirstPass", "omittedOnPurpose"],
  },
};

// Step 3 — delegation.
//
// A subagent starts from nothing. It cannot see the topic, the goal, the decomposition, or what
// any other subagent found. Its prompt is its entire world. Everything it needs has to be written
// into that prompt by the coordinator, every time — which is why the brief is assembled by a
// function rather than improvised at each call site.
const FINDINGS_TOOL = {
  name: "submit_findings",
  description: "Return the findings for the assigned subtopic.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        description: "Three to five concrete findings on the assigned subtopic.",
        items: {
          type: "object",
          properties: {
            claim: { type: "string", description: "One sentence stating the finding." },
            detail: { type: "string", description: "The supporting specifics: figures, dates." },
            source: { type: "string", description: "Where this comes from, as specifically as possible." },
            // Self-reported, and therefore useful for flagging but never for automated routing.
            // Raw model confidence is uncalibrated — 0.9 does not mean 90 % correct
            // until it has been checked against a labelled set. Carried here so a human can see
            // which findings the agent itself was unsure about.
            confidence: {
              type: "number",
              description:
                "0.0 to 1.0 — how certain the agent is of this specific finding. Be honest: " +
                "use a low value for figures recalled approximately or likely to be out of date.",
            },
          },
          required: ["claim", "detail", "source", "confidence"],
        },
      },
      outOfScopeNoted: {
        type: "string",
        description:
          "Anything relevant encountered that belongs to a different subtopic, for the " +
          "coordinator to route. Empty string if nothing.",
      },
    },
    required: ["findings", "outOfScopeNoted"],
  },
};

// Everything the subagent will ever know, in one place. Each section exists because its absence
// produces a specific, documented failure: no goal and the findings drift off-purpose; no scope
// and neighbouring subtopics get duplicated; no prior findings and the same ground is covered
// twice; no output contract and the results cannot be aggregated.
export function buildSubagentBrief({ report, subtopic, priorFindings }) {
  const prior = priorFindings.length
    ? priorFindings.map((f) => `  - ${f.claim} (${f.subtopic})`).join("\n")
    : "  (none — you are the first subagent on this task)";

  // The sibling titles were missing from the first version of this brief, and the subagents said
  // so themselves: one routed something out of scope "to a grid integration subtopic if one
  // exists". It did exist. Without the roster a subagent cannot tell the difference between
  // "someone else has this" and "nobody has this", so it hedges, and the coordinator gets a
  // routing note it cannot act on.
  const siblings = report.subtopics
    .filter((s) => s.title !== subtopic.title)
    .map((s) => `  - ${s.title}`)
    .join("\n");

  return `RESEARCH TASK

Overall topic: ${report.topic}
Overall goal: ${report.goal}

You are responsible for exactly ONE subtopic of that larger effort:

  Subtopic: ${subtopic.title}
  Scope:    ${subtopic.scope}

Already established by other subagents — do not repeat this work:
${prior}

These subtopics belong to other agents. They are covered; leave them alone:
${siblings}

Stay inside your scope. If you come across something important that fits none of the subtopics
listed above, do not research it — name it in outOfScopeNoted so the coordinator can route it.

Return three to five concrete findings, each with supporting specifics, a source, and an honest
confidence value between 0 and 1.`;
}

async function runSubagent({ agent, report, subtopic, priorFindings }) {
  const brief = buildSubagentBrief({ report, subtopic, priorFindings });

  const response = await createMessage(report, {
    model: FORCED_TOOL_MODEL,
    max_tokens: 4096,
    system: agent.systemPrompt,
    tools: [FINDINGS_TOOL],
    tool_choice: { type: "tool", name: FINDINGS_TOOL.name },
    messages: [{ role: "user", content: brief }],
  });

  const result = toolInput(response, `subagent ${agent.name}`);

  return {
    brief,
    findings: asArray(result.findings)
      .filter((f) => f && typeof f.claim === "string" && f.claim.trim())
      .map((f) => ({
        claim: f.claim.trim(),
        detail: typeof f.detail === "string" ? f.detail : "",
        source: typeof f.source === "string" ? f.source : "",
        confidence: typeof f.confidence === "number" ? f.confidence : null,
        subtopic: subtopic.title,
        foundBy: agent.name,
      })),
    outOfScopeNoted: typeof result.outOfScopeNoted === "string" ? result.outOfScopeNoted : "",
  };
}

// Step 4 — coverage assessment.
//
// Deliberately programmatic, not a model call. "Which subtopics have substantive findings" is a
// counting question, and counting questions get counted. Asking a model to judge its own coverage
// invites the exact optimism the assessment exists to catch. Where the answer must be right
// every time, enforce it in code, not in a prompt.
export const COVERAGE_THRESHOLD = 0.9;
const SUBSTANTIVE_FINDINGS = 3; // fewer than this is a mention, not coverage
const SUBSTANTIVE_CONFIDENCE = 0.5;

export function evaluateCoverage(report) {
  const perSubtopic = report.subtopics.map((subtopic) => {
    const findings = report.findings.filter((f) => f.subtopic === subtopic.title);
    const scored = findings.filter((f) => typeof f.confidence === "number");
    const meanConfidence = scored.length
      ? scored.reduce((sum, f) => sum + f.confidence, 0) / scored.length
      : null;

    let status;
    if (findings.length === 0) status = "missing";
    else if (findings.length < SUBSTANTIVE_FINDINGS) status = "partial";
    else if (meanConfidence !== null && meanConfidence < SUBSTANTIVE_CONFIDENCE) status = "partial";
    else status = "covered";

    return { title: subtopic.title, status, findingCount: findings.length, meanConfidence };
  });

  const covered = perSubtopic.filter((s) => s.status === "covered");
  const partial = perSubtopic.filter((s) => s.status === "partial");
  const missing = perSubtopic.filter((s) => s.status === "missing");

  return {
    perSubtopic,
    covered: covered.map((s) => s.title),
    partial: partial.map((s) => s.title),
    missing: missing.map((s) => s.title),
    // Only fully covered subtopics count. Partial coverage is a gap that happens to have
    // something in it — treating it as done is how thin reports pass review.
    completeness: report.subtopics.length ? covered.length / report.subtopics.length : 0,
  };
}

// Step 6 — the written report.
//
// Synthesis is the last place attribution can die. The instruction to keep sources attached is
// explicit for that reason; example 30 is built entirely on this failure mode.
async function writeReport(report) {
  const findingsBlock = report.findings
    .map((f) => `[${f.subtopic}] ${f.claim}\n    ${f.detail}\n    source: ${f.source}`)
    .join("\n\n");

  const uncovered = [...report.coverage.missing, ...report.coverage.partial];

  const response = await createMessage(report, {
    model: MODEL,
    max_tokens: 16000,
    system: COORDINATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write the final research report.

Topic: ${report.topic}
Goal: ${report.goal}

Findings gathered by the subagents:

${findingsBlock || "(no findings were gathered)"}

Write one section per subtopic that has findings, using the findings and nothing else, in at most
120 words per section. Do not add facts the subagents did not report — you are synthesising, not
researching. Keep each claim's source attached.

End with a section headed "Coverage limitations" naming these subtopics as not covered or only
partially covered by this report:
${uncovered.length ? uncovered.map((t) => `  - ${t}`).join("\n") : "  (none)"}

A reader must be able to tell what this report covers and what it does not.`,
      },
    ],
  });

  // A report cut off here would lose its coverage limitations, the section that keeps it honest.
  if (response.stop_reason !== "end_turn") {
    throw new Error(
      `report: stopped on ${response.stop_reason}, so the written report is incomplete. ` +
        `Computed cost so far: $${reportCost(report).toFixed(4)}.`
    );
  }

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// The report the coordinator hands back. Everything beyond the brief is filled in by later steps;
// the empty fields are what those steps fill in, not oversights.
export function emptyReport(topic) {
  return {
    topic,
    goal: null,
    breadthNote: null,
    availableSubagents: SUBAGENTS.map((agent) => agent.name),
    subtopics: [], // step 2 — decomposition
    findings: [], // step 3 — subagent results
    notDelegated: [], // step 3 — subtopics the delegation budget did not reach
    coverage: null, // step 4 — completeness assessment
    refinementRounds: 0, // step 5 — iterative re-delegation
    refinementLog: [], // step 5 — what each round targeted, and what was already covered
    usage: {}, // tokens per model, for the cost line
    text: null, // final written report
  };
}

// Example 01, applied: check stop_reason before trusting the payload. A response cut off at
// max_tokens still contains a tool_use block — just a truncated one, whose input silently arrives
// with fields missing or empty. Reading it as success turns a transport failure into a plausible
// wrong answer, which is far harder to notice than a crash.
// A field can come back in the wrong SHAPE, not just missing. `?? []` does not help then —
// it only catches null and undefined, and an object or a string sails straight through into code
// that expects an array. `required` and `type` in an input_schema are strong hints, not
// enforcement. Every field is normalised on arrival, and anything unusable is reported, never
// silently swallowed.
function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") {
    // The first characters are what matters when a field arrives as text: they say whether this
    // is serialised JSON worth recovering or prose that never was the requested shape.
    return `string(${value.length}) starting "${value.slice(0, 160).replace(/\s+/g, " ")}…"`;
  }
  if (typeof value === "object") return `object{${Object.keys(value).slice(0, 5).join(",")}}`;
  return typeof value;
}

export function asArray(value) {
  if (Array.isArray(value)) return value;

  // Observed intermittently: the model serialises an array field into a JSON *string* instead of
  // passing the array itself. The data is intact, only the encoding is wrong — recover it rather
  // than discarding a complete decomposition over a quoting mistake.
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return asArray(JSON.parse(text));
      } catch {
        // Not JSON after all — fall through and treat it as a single value.
      }
    }
    return [text];
  }

  // A malformed array sometimes arrives as an object keyed "0", "1", … — also recoverable.
  if (value && typeof value === "object") return Object.values(value);

  return [];
}

export function asStringList(value) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item : item?.title ?? item?.name ?? ""))
    .filter((item) => typeof item === "string" && item.trim());
}

// Observed roughly every other run on a large decomposition: instead of filling the three schema
// fields, the model puts the ENTIRE tool input into the first field as a JSON string —
//
//   { subtopics: '{"subtopics":[…],"missingFromFirstPass":[…],"omittedOnPurpose":"…"}' }
//
// Every value is present and correct; only one level of wrapping is wrong. Throwing away a
// complete decomposition over a quoting mistake would be the wrong call, so unwrap it.
export function unwrapDecomposition(input) {
  const nested = input?.subtopics;
  if (typeof nested !== "string") return input;

  const text = nested.trim();
  if (!text.startsWith("{")) return input;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not recoverable — most often a payload cut off mid-serialisation.
    return input;
  }

  if (parsed && typeof parsed === "object" && "subtopics" in parsed) {
    console.warn("  phase B: tool input arrived nested inside a JSON string — unwrapped.");
    return { ...input, ...parsed };
  }

  return input;
}

export function normaliseSubtopics(raw, phase) {
  const list = asArray(raw);
  const usable = list.filter((item) => item && typeof item.title === "string" && item.title.trim());

  if (usable.length < list.length) {
    console.warn(`  ${phase}: dropped ${list.length - usable.length} malformed subtopic entries.`);
  }
  if (usable.length === 0) {
    throw new Error(
      `${phase}: no usable subtopics — received ${describe(raw)}. ` +
        "Continuing with an empty decomposition would hand back a confident, empty report."
    );
  }

  return usable.map((item) => ({
    title: item.title.trim(),
    scope: typeof item.scope === "string" ? item.scope : "",
  }));
}

function toolInput(response, phase) {
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `${phase}: response hit max_tokens — the tool call is truncated and its input incomplete. ` +
        "Raise max_tokens rather than working with the partial result."
    );
  }

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block) {
    throw new Error(`${phase}: no tool_use block in the response (stop_reason=${response.stop_reason}).`);
  }

  return block.input;
}

// Phase A — enumerate. Names only: keeping it cheap and shallow means the model spends its effort
// on breadth rather than on writing prose about the first few entries.
export async function enumerateCategories(report) {
  const response = await createMessage(report, {
    model: FORCED_TOOL_MODEL,
    max_tokens: 1024,
    system: COORDINATOR_SYSTEM_PROMPT,
    tools: [CATEGORIES_TOOL],
    tool_choice: { type: "tool", name: CATEGORIES_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Topic: ${report.topic}
Goal: ${report.goal}
Where the breadth lies: ${report.breadthNote}
${report.scopeNote ? `\nScope decided by the requester — this overrides your own reading of what belongs:\n${report.scopeNote}\n` : ""}
List ALL major categories of this topic. Names only, no descriptions. Go wide before going deep —
this is the enumeration pass, and missing an entire category here is a critical failure.`,
      },
    ],
  });

  return asStringList(toolInput(response, "phase A").categories);
}

// Phase B — validate, then decompose. The prompt deliberately asks for ABSENCE first. Reviewing a
// list for what is not on it is a different search from producing the list, and it is the search
// that surfaces contested and adjacent categories the first pass quietly dropped.
export async function validateAndDecompose(report, categories) {
  const response = await createMessage(report, {
    model: FORCED_TOOL_MODEL,
    // Generous: a dozen subtopics with a sentence of scope each runs long, and truncation here
    // is indistinguishable from a bad decomposition.
    max_tokens: 8192,
    system: COORDINATOR_SYSTEM_PROMPT,
    tools: [DECOMPOSE_TOOL],
    tool_choice: { type: "tool", name: DECOMPOSE_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Topic: ${report.topic}
Goal: ${report.goal}
${report.scopeNote ? `\nScope decided by the requester — this overrides your own reading of what belongs:\n${report.scopeNote}\n` : ""}
A first pass produced these categories:
${categories.map((c) => `  - ${c}`).join("\n")}

Your job now is the opposite of the first pass: find what is MISSING.

Name every major area of this topic that the list above does not cover.

Then, separately and explicitly: name the individual technologies, methods or cases whose
membership in this topic is DEBATED, SPECULATIVE or still PRE-COMMERCIAL — by name, not as a
category such as "emerging technologies". A first pass drops exactly these, because deciding they
do not strictly belong is easier than deciding where to put them. Do not resolve that debate by
excluding them: read the topic inclusively, add each one as a subtopic, and record the dispute as a
caveat in its scope.

Omission is irreversible and invisible downstream; a caveated subtopic can still be discarded at
the end, a missing one cannot be recovered.

Then produce the final decomposition: at least ${MIN_SUBTOPICS} non-overlapping subtopics covering
the first-pass categories AND everything you just identified as missing. Each must be something a
specialist could research on its own.`,
      },
    ],
  });

  return unwrapDecomposition(toolInput(response, "phase B"));
}

// How many subtopics actually get delegated. A budget, not a shortcut: one subagent call per
// subtopic means a 30-subtopic decomposition costs 30 calls per run.
//
// The number matters far less than the fact that it is STATED. A coordinator that quietly covers
// two subtopics out of thirty and hands back a confident report has not produced a partial
// answer — it has produced a misleading one. Whatever is skipped is named in the output.
export const DEFAULT_MAX_DELEGATIONS = 2;

function logCoverage(coverage, label) {
  const pct = (coverage.completeness * 100).toFixed(0);
  console.log(
    `\ncoverage (${label}): ${pct}% — ` +
      `${coverage.covered.length} covered, ${coverage.partial.length} partial, ` +
      `${coverage.missing.length} missing`
  );
}

export async function runCoordinator(
  topic,
  {
    onEvent,
    // Where a topic's boundary is contested, the caller declares it — the coordinator does not
    // infer it. Three prompt-level attempts to make the model read "renewable energy" inclusively
    // enough to include fusion all failed: its domain taxonomy ("fusion is not renewable") is a
    // prior that instructions about inclusiveness do not move. That is the right outcome for a
    // model to have, and the wrong place to fight it. A contested scope is a decision, and a
    // decision belongs in the input, not in a prompt hoping to be persuasive.
    scopeNote = "",
    maxDelegations = DEFAULT_MAX_DELEGATIONS,
    // The refinement loop needs both bounds. The threshold is the real stop condition; the round
    // limit is the safety net that keeps an unreachable threshold from looping forever — the same
    // distinction example 01 drew between stop_reason and the iteration cap.
    maxRefinementRounds = 2,
    gapsPerRound = 2,
  } = {}
) {
  const emit = (event) => onEvent?.(event);
  const report = emptyReport(topic);
  report.scopeNote = scopeNote;

  console.log(`\n${"=".repeat(70)}\nTOPIC: ${topic}\n${"=".repeat(70)}`);
  emit({ type: "start", topic });

  console.log("\nregistered subagents:");
  for (const agent of SUBAGENTS) console.log(`  ${agent.name} — ${agent.description}`);
  emit({ type: "subagents", subagents: SUBAGENTS.map(({ name, description }) => ({ name, description })) });

  emit({ type: "stage", id: "brief", status: "running" });

  const response = await createMessage(report, {
    model: FORCED_TOOL_MODEL,
    max_tokens: 1024,
    system: COORDINATOR_SYSTEM_PROMPT,
    tools: [BRIEF_TOOL],
    tool_choice: { type: "tool", name: BRIEF_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Research topic: ${topic}\n\nFrame this task before any delegation.`,
      },
    ],
  });

  const brief = toolInput(response, "brief");
  report.goal = brief.goal;
  report.breadthNote = brief.breadthNote;

  console.log(`\ngoal:        ${report.goal}`);
  console.log(`breadthNote: ${report.breadthNote}`);

  emit({ type: "brief", goal: report.goal, breadthNote: report.breadthNote });
  emit({ type: "stage", id: "brief", status: "done" });

  // --- Step 2: decomposition -------------------------------------------------------------
  emit({ type: "stage", id: "decompose", status: "running" });

  const categories = await enumerateCategories(report);
  console.log(`\nphase A — ${categories.length} categories: ${categories.join(", ")}`);
  emit({ type: "categories", categories });

  const decomposition = await validateAndDecompose(report, categories);
  report.subtopics = normaliseSubtopics(decomposition.subtopics, "phase B");
  report.omittedOnPurpose =
    typeof decomposition.omittedOnPurpose === "string" ? decomposition.omittedOnPurpose : "";
  report.missingFromFirstPass = asStringList(decomposition.missingFromFirstPass);

  console.log(
    `\nphase B — validation added: ${
      report.missingFromFirstPass.length ? report.missingFromFirstPass.join(", ") : "nothing"
    }`
  );

  console.log(`\nsubtopics (${report.subtopics.length}):`);
  for (const [i, sub] of report.subtopics.entries()) {
    console.log(`  ${i + 1}. ${sub.title} — ${sub.scope}`);
  }
  if (report.omittedOnPurpose) console.log(`\ndeliberately omitted: ${report.omittedOnPurpose}`);

  // Not a retry — filling gaps is step 5. Here it only has to be impossible to miss.
  if (report.subtopics.length < MIN_SUBTOPICS) {
    console.warn(
      `\n  WARNING: only ${report.subtopics.length} subtopics, expected at least ${MIN_SUBTOPICS}.` +
        "\n  Narrow decomposition — whatever is missing here can never reach the final report."
    );
  }

  emit({
    type: "decomposition",
    subtopics: report.subtopics,
    missingFromFirstPass: report.missingFromFirstPass,
    omittedOnPurpose: report.omittedOnPurpose,
    tooFew: report.subtopics.length < MIN_SUBTOPICS,
    minimum: MIN_SUBTOPICS,
  });
  emit({ type: "stage", id: "decompose", status: "done" });

  // --- Step 3: delegation ----------------------------------------------------------------
  emit({ type: "stage", id: "delegate", status: "running" });

  // Subtopics are handed round-robin to the available subagents, up to the budget. Running them
  // in sequence rather than in parallel is deliberate — it is what makes "context from prior
  // agents" something to actually pass rather than a phrase. Parallel spawning is example 03.
  const assignments = report.subtopics
    .slice(0, maxDelegations)
    .map((subtopic, i) => ({ agent: SUBAGENTS[i % SUBAGENTS.length], subtopic }));

  report.notDelegated = report.subtopics.slice(maxDelegations).map((s) => s.title);

  if (report.notDelegated.length) {
    console.warn(
      `\n  ${assignments.length} of ${report.subtopics.length} subtopics delegated — ` +
        `${report.notDelegated.length} left uncovered by the delegation budget.`
    );
  }

  emit({
    type: "delegationPlan",
    delegated: assignments.map((a) => ({ agent: a.agent.name, subtopic: a.subtopic.title })),
    total: report.subtopics.length,
    notDelegated: report.notDelegated,
  });

  for (const { agent, subtopic } of assignments) {
    console.log(`\ndelegating "${subtopic.title}" -> ${agent.name}`);
    emit({ type: "delegating", agent: agent.name, subtopic: subtopic.title });

    const result = await runSubagent({
      agent,
      report,
      subtopic,
      priorFindings: report.findings, // everything gathered so far, passed explicitly
    });

    report.findings.push(...result.findings);

    for (const finding of result.findings) console.log(`  · ${finding.claim}`);
    if (result.outOfScopeNoted) console.log(`  (out of scope: ${result.outOfScopeNoted})`);

    emit({
      type: "subagentResult",
      agent: agent.name,
      subtopic: subtopic.title,
      brief: result.brief,
      findings: result.findings,
      outOfScopeNoted: result.outOfScopeNoted,
    });
  }

  console.log(`\n${report.findings.length} findings from ${assignments.length} subagent runs`);
  emit({ type: "stage", id: "delegate", status: "done" });

  // --- Step 4: aggregate and assess coverage ----------------------------------------------
  emit({ type: "stage", id: "aggregate", status: "running" });

  report.coverage = evaluateCoverage(report);
  logCoverage(report.coverage, "initial");
  emit({ type: "coverage", round: 0, ...report.coverage });
  emit({ type: "stage", id: "aggregate", status: "done" });

  // --- Step 5: iterative refinement --------------------------------------------------------
  //
  // What separates a coordinator from a dispatcher: it reads its own output, finds the gaps and
  // goes back out for them. A single delegation pass is dispatching.
  emit({ type: "stage", id: "refine", status: "running" });

  while (report.coverage.completeness < COVERAGE_THRESHOLD && report.refinementRounds < maxRefinementRounds) {
    // Only the gaps are re-delegated — never the subtopics already covered. Re-running covered
    // work is the wasteful failure this loop is specifically not allowed to have.
    const gaps = [...report.coverage.missing, ...report.coverage.partial].slice(0, gapsPerRound);
    if (gaps.length === 0) break;

    report.refinementRounds++;
    report.refinementLog.push({ round: report.refinementRounds, targeting: gaps, coveredBefore: report.coverage.covered });
    console.log(`\nrefinement round ${report.refinementRounds}: targeting ${gaps.join(", ")}`);
    emit({ type: "refinementRound", round: report.refinementRounds, targeting: gaps });

    for (const [i, title] of gaps.entries()) {
      const subtopic = report.subtopics.find((s) => s.title === title);
      const agent = SUBAGENTS[i % SUBAGENTS.length];

      const result = await runSubagent({
        agent,
        report,
        subtopic,
        priorFindings: report.findings,
      });

      report.findings.push(...result.findings);
      emit({
        type: "subagentResult",
        agent: agent.name,
        subtopic: subtopic.title,
        round: report.refinementRounds,
        brief: result.brief,
        findings: result.findings,
        outOfScopeNoted: result.outOfScopeNoted,
      });
    }

    report.coverage = evaluateCoverage(report);
    logCoverage(report.coverage, `after round ${report.refinementRounds}`);
    emit({ type: "coverage", round: report.refinementRounds, ...report.coverage });
  }

  const stopReason =
    report.coverage.completeness >= COVERAGE_THRESHOLD
      ? "threshold reached"
      : `round limit of ${maxRefinementRounds} reached with ${report.coverage.missing.length + report.coverage.partial.length} gaps left`;

  console.log(`\nrefinement stopped: ${stopReason}`);
  emit({ type: "refinementStopped", reason: stopReason, rounds: report.refinementRounds });
  emit({ type: "stage", id: "refine", status: "done" });

  // --- Step 6: the written report ----------------------------------------------------------
  emit({ type: "stage", id: "write", status: "running" });
  report.text = await writeReport(report);
  emit({ type: "finalReport", text: report.text });
  emit({ type: "stage", id: "write", status: "done" });

  console.log("\nreport so far:");
  console.log(JSON.stringify(report, null, 2));

  report.costUsd = reportCost(report);
  console.log(`\ncomputed cost of this run: $${report.costUsd.toFixed(4)}`);

  emit({ type: "report", report });
  emit({ type: "done" });

  return report;
}
