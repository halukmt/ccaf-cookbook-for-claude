// The structured output format subagents hand back to the coordinator, and the verification
// helper that checks every claim in a synthesis report traces to one of these findings.
//
// FINDING_SCHEMA below is the shape of one finding. A ResearchOutput wraps a list of findings with
// the query and a timestamp (see toResearchOutput).
export const FINDING_SCHEMA = {
  type: "object",
  properties: {
    claim: { type: "string" },
    source_url: { type: "string" },
    document_name: { type: "string" },
    page_number: { type: ["number", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    retrieved_by: { type: "string" },
  },
  required: ["claim", "confidence", "retrieved_by"],
};

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

// The Agent SDK has no equivalent of the Messages API's forced tool_choice (example 02, rule
// 8) — a Task-spawned subagent's result is free text, whatever it decided to write. The
// closest available substitute: ask for a fenced ```json block in the subagent's system
// prompt, then parse defensively on arrival. This is strictly weaker than a forced tool call —
// noted here rather than silently treated as equivalent.
export function parseFinding(rawText, retrievedBy) {
  const match = rawText.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  return normaliseFinding(data, retrievedBy);
}

function normaliseFinding(data, retrievedBy) {
  if (typeof data?.claim !== "string") return null;

  return {
    claim: data.claim,
    source_url: typeof data.source_url === "string" ? data.source_url : "",
    document_name: typeof data.document_name === "string" ? data.document_name : "",
    page_number: typeof data.page_number === "number" ? data.page_number : null,
    confidence: VALID_CONFIDENCE.has(data.confidence) ? data.confidence : "low",
    retrieved_by: retrievedBy,
  };
}

// Subagents are free to answer with one finding or with an array of them.
export function parseFindings(rawText, retrievedBy) {
  const match = rawText.match(/```json\s*([\s\S]*?)```/);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  return (Array.isArray(data) ? data : [data])
    .map((item) => normaliseFinding(item, retrievedBy))
    .filter(Boolean);
}

// A subagent's text reaches the stream in one of two shapes: background subagents emit assistant
// messages tagged with parent_tool_use_id, foreground subagents only return a tool_result to the
// coordinator. Both are returned here, keyed by the coordinator's Agent tool_use id.
export function subagentTexts(message) {
  const content = message.message?.content;
  if (!Array.isArray(content)) return [];

  if (message.type === "assistant" && message.parent_tool_use_id) {
    return content
      .filter((block) => block.type === "text")
      .map((block) => ({ agentToolUseId: message.parent_tool_use_id, text: block.text }));
  }

  if (message.type === "user" && !message.parent_tool_use_id) {
    return content
      .filter((block) => block.type === "tool_result" && Array.isArray(block.content))
      .flatMap((block) =>
        block.content
          .filter((item) => item.type === "text")
          .filter((item) => !/^(agentId:|Async agent launched)/.test(item.text))
          .map((item) => ({ agentToolUseId: block.tool_use_id, text: item.text }))
      );
  }

  return [];
}

// Wraps a list of findings from one subagent into the ResearchOutput shape the synthesis
// prompt template expects (see coordinator.js).
export function toResearchOutput(findings, query, timestamp) {
  return { findings, query, timestamp };
}

// `extractClaims` splits a report into sentences, the simplest usable unit of a claim.
export function extractClaims(report) {
  return report.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

// A naive verification function, kept for comparison. Two things worth flagging rather than
// silently fixing:
// 1. `report.includes(claim)` is always true — claim came from splitting report in the first
// 2. For document findings, source_url is "" (empty string). `"any string".includes("")`
//    is always true in JS, so every document-sourced claim passes this check regardless of
//    whether its page_number citation is actually present anywhere. In practice this function
//    only meaningfully verifies web-search findings.
// Kept unchanged, for comparison. Step 5 rests its verdict on verifyAttribution() below.
export function verifyCitations(report, findings) {
  const anyUrlInReport = findings.some((finding) => report.includes(finding.source_url));
  return extractClaims(report).filter((claim) => !(anyUrlInReport && report.includes(claim)));
}

// A finding counts as cited when its URL, or its document name with its page, is in the text.
function citesFinding(text, finding) {
  if (finding.source_url) return text.includes(finding.source_url);
  return text.includes(finding.document_name) && new RegExp(`\\b(page|p\\.)\\s*${finding.page_number}\\b`, "i").test(text);
}

// What code can really test about attribution: every finding's source is cited, every figure comes
// from a finding, and a paragraph stating a figure has a citation beside it. It cannot tell whether a
// sentence with no figure says what its source says.
export function verifyAttribution(report, findings) {
  const numbersIn = (text) =>
    text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^\s*\d+\.\s/gm, "")
      .match(/\d+(?:\.\d+)?/g) ?? [];
  const known = new Set(findings.flatMap((f) => [...numbersIn(f.claim), String(f.page_number)]));
  const paragraphs = report.split(/\n\s*\n|\n(?=\s*[-*] )/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#"));

  return {
    uncitedFindings: findings.filter((f) => !citesFinding(report, f)).map((f) => f.claim),
    unsupportedNumbers: [...new Set(numbersIn(report))].filter((n) => !known.has(n)),
    uncitedParagraphs: paragraphs.filter((p) => numbersIn(p).length > 0 && !findings.some((f) => citesFinding(p, f))),
  };
}
