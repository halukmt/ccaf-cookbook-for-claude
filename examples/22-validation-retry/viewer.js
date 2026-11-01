// Adapter between the central server and the retry loop.
// "saved" re-reads fixed results at no cost. "live" runs the loop for one document.

import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { documentText, getDocument } from "../../_fixtures/documents-answers.js";
import { sumOf } from "./extraction.js";
import { findingsFrom, patternPriorities, selfReportAccuracy } from "./patterns.js";
import { runLoop } from "./retry-loop.js";
import { SEEDED } from "./seeded-failures.js";

const store = resultStore(import.meta.url);

const describe = (r) => (r.errors.map((e) => `[${e.fixable ? "fixable" : "unfixable"}] ${e.message}`).join("\n") || "No blocking errors.");
const tone = (r) => (r.status === "clean" ? "good" : "warn");

function emitLoop(emit, id, r, label) {
  emit({ type: "card", title: `${id}: ${label}`, badge: `${r.status}, ${r.retries} retries`, tone: tone(r), text: describe(r) });
}

function emitSaved(emit) {
  const { natural, seeded } = store.load("loop");
  emit({ type: "section", title: "Natural first pass", text: "The fixable pair passed on their own. Absent information goes to a person with no retry." });
  for (const [id, r] of Object.entries(natural)) emitLoop(emit, id, r, "as extracted");
  emit({ type: "section", title: "Seeded failure, then real retries", text: "A hand-written bad extraction went in. The retries are real calls." });
  for (const [id, r] of Object.entries(seeded)) {
    emitLoop(emit, id, r, "seeded");
    emit({ type: "card", title: "Before and after", tone: "muted", data: { before: r.firstErrors.map((e) => e.message), itemsAfter: r.result.line_items.map((l) => `${l.description}: ${l.amount}`), modelCalculated: r.modelResult.calculated_total, codeCalculated: r.result.calculated_total } });
  }
  const log = store.load("pattern-log");
  const results = Object.fromEntries(Object.entries(log).map(([id, row]) => [id, row.result]));
  emit({ type: "section", title: "Pattern log", text: "Dismissals are simulated from the answer key, since no developer reviewed anything." });
  emit({ type: "card", title: "detected_pattern, ranked", tone: "muted", text: patternPriorities(findingsFrom(results)).map((p) => `${p.pattern.padEnd(22)} ${String(p.dismissed).padStart(2)} of ${p.total} dismissed`).join("\n") });
  const self = selfReportAccuracy(results);
  emit({ type: "summary", items: [
    [`${self.calculatedRight} of ${self.documents}`, "model's calculated_total right"],
    [`${self.conflictsCaught} of ${self.realConflicts}`, "real conflicts it flagged"],
    [`${self.falseConflicts}`, "false conflict alarms"],
  ] });
}

async function emitLive(params, emit) {
  const id = params.get("doc");
  const doc = getDocument(id);
  const useSeed = params.get("seed") === "yes" && SEEDED[id];
  emit({ type: "card", title: doc.file, badge: useSeed ? "starts from a seeded failure" : "real first pass", tone: "tool", data: documentText(doc) });
  const r = await runLoop(documentText(doc), {
    seeded: useSeed ? SEEDED[id] : undefined,
    maxRetries: Math.min(Number(params.get("retries") ?? 3), 3),
    onEvent: ({ attempt, errors, result }) => emit({ type: "card", title: `Attempt ${attempt}`, badge: `${errors.filter((e) => !e.advisory).length} blocking errors`, tone: errors.some((e) => !e.advisory) ? "warn" : "good", text: errors.map((e) => `[${e.advisory ? "advisory" : e.fixable ? "fixable" : "unfixable"}] ${e.message}`).join("\n") || "Valid.", data: { line_items: result.line_items?.map((l) => l.amount), stated_total: result.stated_total, calculated_total: result.calculated_total } }),
  });
  emit({ type: "card", title: "Outcome", badge: r.status, tone: tone(r), text: describe(r) });
  emit({ type: "summary", items: [[r.retries, "retries"], [usd(estimateCost(FORCED_TOOL_MODEL, sumOf(r.usages))), "estimated from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
