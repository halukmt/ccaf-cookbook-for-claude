// Adapter between the central server and the tool schemas.
// "saved" re-reads fixed results at no cost. "live" makes one small call on one document.

import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { documentText, getDocument, scoreExtraction, tallyOutcomes } from "../../_fixtures/documents-answers.js";
import { JSON_FORMAT, SCORED_FIELDS, USE_FORMAT, USE_TOOL, allRequiredTool, callModel, extractDetailTool, extractMetadataTool, extractTool, kindTools, strictTool } from "./tools.js";

const store = resultStore(import.meta.url);

const ARMS = {
  auto: { label: "auto", model: FORCED_TOOL_MODEL, tools: [extractTool], toolChoice: { type: "auto" } },
  any: { label: "any, three tools", model: FORCED_TOOL_MODEL, tools: kindTools, toolChoice: { type: "any" } },
  named: { label: "named tool", model: FORCED_TOOL_MODEL, tools: [extractMetadataTool, extractDetailTool], toolChoice: { type: "tool", name: "extract_metadata" } },
  required: { label: "all fields required", model: FORCED_TOOL_MODEL, tools: [allRequiredTool], toolChoice: { type: "tool", name: "extract_document" } },
  strict: { label: "strict + auto on Sonnet 5.5", model: MODEL, tools: [strictTool], toolChoice: { type: "auto" }, system: USE_TOOL },
  format: { label: "output_config.format on Sonnet 5.5", model: MODEL, system: USE_FORMAT, outputConfig: { format: JSON_FORMAT } },
};

function emitSaved(emit) {
  emit({ type: "section", title: "tool_choice, on Haiku 5.5", text: "Five document kinds. A red card answered in text or called more than the forced tool." });
  for (const [name, file, wanted] of [["auto", "auto"], ["any", "any"], ["named", "named", "extract_metadata"], ["named, parallel disabled", "named-single", "extract_metadata"]]) {
    const rows = store.load(file);
    const ok = rows.every((r) => (wanted ? r.toolNames.length === 1 && r.toolNames[0] === wanted : r.toolName));
    emit({ type: "card", title: name, badge: ok ? "as intended" : "see rows", tone: ok ? "good" : "warn", text: rows.map((r) => `${r.docId}  ${r.stopReason.padEnd(9)} ${(r.toolNames ?? [r.toolName]).filter(Boolean).join(" + ") || "text only"}`).join("\n") });
  }

  emit({ type: "section", title: "Nullable against all-required", text: "Scored against the key. Five absent fields can be invented." });
  for (const [name, file] of [["Nullable", "nullable"], ["All required", "all-required"]]) {
    const rows = store.load(file);
    const tally = tallyOutcomes(rows.map((r) => scoreExtraction(getDocument(r.docId), r.input, SCORED_FIELDS)));
    emit({ type: "summary", items: [[name, "schema"], [`${tally.correct + tally.correct_null} of ${tally.fields}`, "fields right"], [`${tally.fabricated} of ${tally.absent}`, "invented"]] });
  }

  const { rejected, arms } = store.load("current-models-summary");
  emit({ type: "section", title: "On Sonnet 5.5", text: "Forced tool_choice is rejected. These are the replacements." });
  for (const attempt of rejected) emit({ type: "card", title: `tool_choice ${JSON.stringify(attempt.toolChoice)}`, badge: `HTTP ${attempt.status}`, tone: "warn", text: attempt.message });
  for (const arm of arms) emit({ type: "summary", items: [[arm.arm, "arm"], [arm.answered, "answered"], [arm.correct, "fields right"], [arm.invented, "invented"], [arm.schemaProblems, "schema problems"]] });
}

async function emitLive(params, emit) {
  const doc = getDocument(params.get("doc"));
  const arm = ARMS[params.get("arm")];
  if (!arm) throw new Error("Unknown arm");
  emit({ type: "card", title: doc.file, tone: "muted", data: documentText(doc) });
  const row = await callModel({ docId: doc.id, ...arm });
  const input = row.input ?? (row.text && arm.outputConfig ? JSON.parse(row.text) : null);
  emit({ type: "card", title: arm.label, badge: `stop_reason: ${row.stopReason}`, tone: input ? "good" : "warn", text: row.text.slice(0, 500), data: { tools: row.toolNames, input } });
  emit({ type: "summary", items: [[usd(estimateCost(row.model, row.usage)), "estimated from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
