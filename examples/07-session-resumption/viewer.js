// Adapter between the central server and the session sequence.
// "saved" re-reads the fixed run at no cost. "live" runs the real CLI in a temporary directory.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparison } from "./comparison.js";
import { runSessionLab, totalCost } from "./pipeline.js";

const savedFile = resolve(dirname(fileURLToPath(import.meta.url)), "results", "sessions.json");

function emitLab(emit, lab) {
  const comparison = buildComparison(lab);

  emit({
    type: "section",
    title: "What resume really sent",
    text: "Read from the API request. The transcript holds every tool result. The request holds far fewer.",
  });
  emit({
    type: "summary",
    items: [
      [lab.toolResultsStored, "tool results stored in the transcript"],
      [lab.resumeNeutral.wire?.toolResults ?? 0, "tool results re-sent on resume"],
      [lab.resumeNeutral.wire?.filesInToolResults?.join(", ") || "none", "fixture files among them"],
      [lab.resumeNeutral.wire?.changeNotice ? "yes" : "no", "told that files changed"],
    ],
  });

  emit({ type: "section", title: "Resume or fresh start" });
  emit({
    type: "card",
    title: "Comparison",
    tone: "tool",
    text: comparison.table
      .map((row) => `${row.metric}\n  resume, neutral: ${row["resume, neutral"]}\n  resume, state question: ${row["resume, state question"]}\n  fresh + summary: ${row["fresh + summary"]}`)
      .join("\n\n"),
  });

  emit({ type: "section", title: "Common expectations, against this run" });
  for (const [label, held] of comparison.predictions) {
    emit({ type: "check", label, pass: held, detail: held ? "held" : "did not hold" });
  }

  emit({ type: "section", title: "The answers", text: "The same three fixed files, asked about in three ways." });
  emit({ type: "card", title: "Resume, neutral", badge: "forked", tone: "warn", text: lab.resumeNeutral.text });
  emit({ type: "card", title: "Resume, asking for the current state", badge: "forked", tone: "warn", text: lab.resumeState.text });
  emit({ type: "card", title: "Fresh session with injected summary", badge: "new session", tone: "good", text: lab.fresh.text });
  emit({ type: "card", title: "The injected summary", tone: "muted", text: lab.summary.markdown });
  emit({ type: "summary", items: [[`$${totalCost(lab).toFixed(2)}`, "CLI cost of this run"]] });
}

export async function run(params, emit) {
  if (params.get("mode") === "live") {
    emit({ type: "section", title: "Live run", text: "One real CLI session after another. This takes a few minutes." });
    const lab = await runSessionLab({ onStage: (stage) => emit({ type: "card", title: stage, tone: "muted" }) });
    emitLab(emit, lab);
    return;
  }
  emitLab(emit, JSON.parse(readFileSync(savedFile, "utf8")));
}
