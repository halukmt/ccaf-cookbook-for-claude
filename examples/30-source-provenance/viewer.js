// Adapter between the central server and the provenance pipeline.
// "saved" re-reads a fixed run. "verify" checks a pasted report against the saved findings, free.
// "live" makes one synthesis call from the saved findings.

import { MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { synthesiseFindings } from "./pipeline.js";
import { anyUrlPresent, conflictProblems, handleConflicts, verifyProvenance } from "./provenance.js";

const store = resultStore(import.meta.url);

function emitCheck(emit, report, findings) {
  const result = verifyProvenance(report, findings);
  const conflicts = conflictProblems(report, handleConflicts(findings));
  emit({ type: "check", label: "Each sentence has a citation", pass: result.uncited.length === 0 && result.sentences > 0, detail: result.uncited.join(" | ") });
  emit({ type: "check", label: "Each citation exists", pass: result.unknownCitations.length === 0, detail: result.unknownCitations.map((u) => `[${u.citation}]`).join(", ") });
  emit({ type: "check", label: "Each number is in what its sentence cites", pass: result.unsupportedNumbers.length === 0, detail: result.unsupportedNumbers.map((u) => `${u.number} in: ${u.sentence}`).join(" | ") });
  emit({ type: "check", label: "No finding was dropped", pass: result.dropped.length === 0, detail: result.dropped.length ? `Dropped: ${result.dropped.join(", ")}` : "" });
  emit({ type: "check", label: "Each conflicting value stands with its own citation", pass: conflicts.length === 0, detail: conflicts.join(" | ") });
  emit({ type: "check", label: "For comparison, the weak test: a source URL appears somewhere", pass: anyUrlPresent(report, findings), detail: "Not used here. It says nothing about which claim came from where." });
}

function emitSaved(emit) {
  const run = store.load("pipeline");
  const analysis = store.load("analysis");
  emit({ type: "section", title: "Claim-source mappings", text: `Each checked against its own document, with a word-for-word excerpt. ${analysis.findings.length - analysis.mappingProblems.length} of ${analysis.findings.length} verified.` });
  for (const f of analysis.findings) emit({ type: "card", title: `[${f.n}] ${f.claim}`, badge: f.measure === "none" ? "" : `${f.measure}: ${f.value}`, tone: "muted", text: `${f.documentName}, ${f.publicationDate}\n${f.sourceUrl}\n"${f.relevantExcerpt}"` });
  emit({ type: "section", title: "Conflicts, annotated", text: "Detected by code. Both values always remain." });
  for (const c of analysis.conflicts) emit({ type: "card", title: c.measure, badge: c.gapDays >= 60 ? "maybe a trend" : "same period", tone: "warn", text: c.possibleExplanation });
  emit({ type: "section", title: "Synthesis, with an attribution rule" });
  emit({ type: "card", title: "Report", tone: "good", text: run.attributed.report });
  emitCheck(emit, run.attributed.report, analysis.findings);
  emit({ type: "section", title: "Synthesis, without the rule" });
  emit({ type: "card", title: "Report", tone: "warn", text: run.plain.report });
  emitCheck(emit, run.plain.report, analysis.findings);
  emit({ type: "section", title: "Format follows content", text: "Rendered by code. Citations stay in every format." });
  emit({ type: "card", title: "Rendered sections", tone: "muted", data: analysis.rendered });
}

async function emitLive(emit, attributionRule) {
  const { findings } = store.load("analysis");
  const result = await synthesiseFindings(findings, { attributionRule });
  emit({ type: "card", title: attributionRule ? "With the attribution rule" : "Without the rule", tone: "good", text: result.report });
  emitCheck(emit, result.report, findings);
  emit({ type: "summary", items: [[usd(estimateCost(MODEL, result.usage)), "computed from tokens and list price"]] });
}

export async function run(params, emit) {
  const mode = params.get("mode") ?? "saved";
  if (mode === "saved") return emitSaved(emit);
  if (mode === "verify") {
    const report = params.get("report")?.trim();
    if (!report) throw new Error("missing report");
    return emitCheck(emit, report, store.load("analysis").findings);
  }
  return emitLive(emit, params.get("rule") !== "off");
}
