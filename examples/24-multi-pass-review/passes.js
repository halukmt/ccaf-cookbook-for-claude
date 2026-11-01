// The passes this review adds. The single and per-file passes, the contract extraction and the JSON
// Lines parser are reused from the pipeline in examples/06-task-decomposition/review.js.

import { client, MODEL } from "../../_shared/client.js";
import { extractContracts, parseJsonLines } from "../../examples/06-task-decomposition/review.js";

const numbered = (content) => content.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
const textOf = (response) => response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const usageOf = (response) => ({ input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens });

const INTEGRATION_FORMAT =
  "Output only JSON Lines, one object per issue and no other text and no code fences: " +
  '{"files":["<name>","<name>"],"category":"data_flow|contradictory_finding|api_contract","severity":"critical|high|medium|low","description":"<one sentence>"}. ' +
  "Report only issues that involve more than one file.";

// Findings go in as structured data. `contracts` adds interfaces extracted by code.
export async function integrationPass(codebase, reviews, { contracts = false, maxTokens = 4096 } = {}) {
  const findings = reviews.flatMap((r) => r.issues.map(({ file, line, severity, description }) => ({ file, line, severity, description })));
  const interfaces = contracts ? `\n\nInterfaces and call sites, extracted from the code:\n${extractContracts(codebase)}` : "";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{
      role: "user",
      content: "From the per-file review findings below, find problems that span more than one file:\n- Data passed between modules in inconsistent ways\n" +
        "- The same pattern judged differently from one file to another\n- Calls that break an API contract between services\n" +
        `${INTEGRATION_FORMAT}\n\nPer-file findings:\n${JSON.stringify(findings)}${interfaces}`,
    }],
  });
  const { items, broken } = parseJsonLines(textOf(response));
  return { contracts, issues: items, brokenLines: broken, stopReason: response.stop_reason, usage: usageOf(response) };
}

const CONFIDENCE_PROMPT =
  "Check this file for bugs, logic errors and security problems. For each finding output one JSON object per line, and no other text and no code fences: " +
  '{"file":"<name>","line":<number>,"severity":"critical|major|minor","confidence":<0.0-1.0>,"reasoning":"<why you are confident or uncertain>","description":"<one sentence>"}. ' +
  "Use the whole confidence range: a finding you can demonstrate from this file alone is high, one that depends on code you cannot see is lower. Output nothing if there are no findings.";

export async function reviewWithConfidence(codebase, { maxTokens = 3000 } = {}) {
  const reviews = [];
  for (const [name, content] of codebase) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: `${CONFIDENCE_PROMPT}\n\n=== ${name} ===\n${numbered(content)}` }],
    });
    const { items, broken } = parseJsonLines(textOf(response));
    reviews.push({ fileName: name, issues: items.map((issue) => ({ ...issue, file: name })), brokenLines: broken, stopReason: response.stop_reason, usage: usageOf(response) });
  }
  return reviews;
}

export const THRESHOLD = 0.8;
export const routeFinding = (finding, threshold = THRESHOLD) => ({ ...finding, route: finding.confidence >= threshold ? "direct_report" : "human_review" });

const VERDICT_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["valid", "assessment"],
    properties: { valid: { type: "boolean" }, assessment: { type: "string" } },
  },
};

// A fresh instance. It gets the file and the claim only: no reasoning, no confidence, no history.
export async function verifyFinding(code, finding, { maxTokens = 2500 } = {}) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { format: VERDICT_FORMAT },
    messages: [{
      role: "user",
      content: `Read this code and decide whether the finding below holds. Judge it from the code as shown. Only call it valid if the code really has this problem.\n\nCode:\n${numbered(code)}\n\nFinding, at line ${finding.line}: ${finding.description}\nSeverity: ${finding.severity}`,
    }],
  });
  if (response.stop_reason !== "end_turn") throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  return { ...JSON.parse(textOf(response)), usage: usageOf(response) };
}

export const BANDS = [[0, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];
export const bandLabel = ([low, high]) => (low === 0 ? "below 0.6" : high > 1 ? "0.9-1.0" : `${low}-${high}`);
export const bandOf = (confidence) => BANDS.find(([low, high]) => confidence >= low && confidence < high);

// An even sample per band, so a thin band is not lost among confident findings.
export function sampleForCalibration(findings, perBand = 6) {
  return BANDS.flatMap((band) => findings.filter((f) => bandOf(f.confidence) === band).slice(0, perBand));
}

// Rates with their sample sizes. keyMatches counts findings that match a planted defect; a finding that
// matches none is not necessarily false, so that column is a lower bound on truth, not a verdict.
export function calibrationCurve(rows) {
  return BANDS.map((band) => {
    const here = rows.filter((r) => bandOf(r.confidence) === band);
    const confirmed = here.filter((r) => r.valid).length;
    const keyMatches = here.filter((r) => r.matchesKey).length;
    return { band: bandLabel(band), n: here.length, confirmed, confirmedRate: here.length ? confirmed / here.length : null, keyMatches };
  });
}

// Controls: false claims about real fixture code, to prove the verifier can say no. Each is checkable
// by reading the file. A verifier that confirms everything fails here.
export const CONTROLS = [
  { file: "cart.js", anchor: "export function cartTotal", severity: "critical", description: "cartTotal returns the total in euros as a decimal number, which loses precision on every call." },
  { file: "config.js", anchor: "vatRate", severity: "major", description: "The config object has no vatRate key, so VAT cannot be read from it." },
  { file: "database.js", anchor: "connection.query", severity: "critical", description: "query() builds its SQL by concatenating the params into the statement, allowing SQL injection." },
  { file: "payments.js", anchor: "export async function chargeCard", severity: "major", description: "chargeCard expects its amount in integer cents, not euros." },
];
