// Adapter between the central server and the research pipeline. No API cost by default.
// "simulate" reruns the simulated failures with real backoff waits, free. Saved synthesis is re-read.

import { resultStore } from "../../_shared/results.js";
import { addCoverageAnnotations, coverageProblems, reviewFindings, runResearch } from "./coordinator.js";
import { createDatabase, TOPICS } from "./mock-database.js";

const store = resultStore(import.meta.url);
const TONE = { "well-supported": "good", limited: "warn", unavailable: "warn", "no-evidence-found": "muted" };

function emitReport(emit, subagentResults, findings) {
  const review = reviewFindings(findings, subagentResults);
  const report = addCoverageAnnotations({ findings: review.accepted }, subagentResults, TOPICS);
  emit({ type: "section", title: "Coverage", text: "Computed by code. A topic that was searched and held nothing differs from a topic that could not be searched." });
  for (const c of report.coverageAnnotations) emit({ type: "card", title: c.topic, badge: c.status, tone: TONE[c.status], text: c.reason });
  if (findings.length) {
    emit({ type: "section", title: "Findings written by the model", text: "Each is checked against what its topic really retrieved." });
    for (const f of review.accepted) emit({ type: "card", title: f.topic, tone: "muted", text: `${f.claim}\n${f.sources.join("\n")}` });
    for (const { finding, reason } of review.flagged) emit({ type: "card", title: finding.topic, badge: "flagged", tone: "warn", text: reason });
    for (const { finding, reason } of review.rejected) emit({ type: "card", title: finding.topic, badge: "rejected by code", tone: "warn", text: `${reason}\n${finding.claim}` });
    const problems = coverageProblems(report, subagentResults);
    emit({ type: "check", label: "Findings and coverage match the real results", pass: problems.length === 0, detail: problems.join("; ") });
  }
}

export async function run(params, emit) {
  const mode = params.get("mode") ?? "saved";
  if (mode === "saved") {
    const { subagentResults, log } = store.load("outcomes");
    const { findings } = store.load("synthesis");
    emit({ type: "section", title: "Recovery decisions", text: "All failures are simulated." });
    for (const entry of log) emit({ type: "tool", name: entry.action, input: { topic: entry.topic }, result: entry.details ? JSON.stringify(entry.details) : `${entry.data ?? ""} partial sources kept`, isError: entry.action !== "proceed_partial" });
    emitReport(emit, subagentResults, findings);
    return;
  }
  const started = Date.now();
  const selected = TOPICS.filter((t) => mode === "all" || t.topic === params.get("topic"));
  if (!selected.length) throw new Error("Unknown topic");
  emit({ type: "section", title: "Simulated run", text: "Waits are real: 1s, 2s, 4s per failing subagent. No model and no cost." });
  const { subagentResults, log } = await runResearch(selected, {
    database: createDatabase(), dateRangeFor: (topic) => (topic === "migration dates" ? "Q2" : undefined),
  });
  for (const r of subagentResults) emit({ type: "card", title: r.topic, badge: r.status, tone: r.status === "success" ? "good" : "warn", data: r });
  for (const entry of log) emit({ type: "tool", name: entry.action, input: { topic: entry.topic }, result: entry.details ? JSON.stringify(entry.details) : "", isError: true });
  emitReport(emit, subagentResults, []);
  emit({ type: "summary", items: [[`${((Date.now() - started) / 1000).toFixed(1)} s`, "of real waiting"]] });
}
