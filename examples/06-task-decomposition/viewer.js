// Adapter between the central server and the review pipeline.
// "saved" re-reads the fixed results at no cost. The other modes make real API calls.

import { CODEBASE_DIR, DEFECTS, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { buildComparison, findContradictions } from "./compare.js";
import { crossFilePass, estimateUsd, loadCodebase, perFileReview, singlePassReview } from "./review.js";
import { loadResult } from "./saved.js";

const mark = (value) => (value ? "found" : "-");

function emitComparison(emit, comparison, source) {
  emit({ type: "section", title: "Issues per file, in review order", text: `Source: ${source}. A drop-off would show as the single-pass column shrinking towards the end.` });
  emit({
    type: "card",
    title: "Single pass vs per-file passes",
    tone: "tool",
    text: comparison.rows
      .map((r) => `${r.file.padEnd(18)} single ${String(r.single).padStart(2)}   per-file ${String(r.multi).padStart(2)}   planted ${r.plantedLocal}`)
      .join("\n"),
  });

  emit({ type: "section", title: "Cross-file defects", text: "Each file is correct on its own. Only the combination is wrong, so what matters is the input each pass gets." });
  for (const [label, found] of [
    ["Single pass (sees all code)", comparison.cross.single],
    ["Per-file passes (see one file)", comparison.cross.perFile],
    ["Integration: summaries and import graph", comparison.cross.summaries],
    ["Integration: plus extracted contracts", comparison.cross.contracts],
  ]) {
    emit({ type: "card", title: label, badge: `${found.length} of 6`, tone: found.length === 6 ? "good" : "warn", text: found.join(", ") || "none" });
  }

  emit({ type: "section", title: "All planted defects" });
  emit({
    type: "card",
    title: "Which approach found what",
    tone: "muted",
    text: comparison.defects
      .map((d) => `${d.id.padEnd(10)} single ${mark(d.single).padEnd(6)} per-file ${mark(d.perFile).padEnd(6)} summaries ${mark(d.crossSummaries).padEnd(6)} contracts ${mark(d.crossContracts)}`)
      .join("\n"),
  });

  emit({
    type: "summary",
    items: [
      [comparison.single.total, "single-pass findings"],
      [comparison.multi.total, "per-file findings"],
      [comparison.single.stdDev.toFixed(2), "std dev, single"],
      [comparison.multi.stdDev.toFixed(2), "std dev, per-file"],
    ],
  });
}

function emitContradictions(emit, label, issues) {
  for (const r of findContradictions(issues)) {
    const flagged = r.sites.filter((s) => s.flagged).map((s) => s.file).join(", ") || "none";
    const passed = r.sites.filter((s) => !s.flagged).map((s) => s.file).join(", ") || "none";
    emit({
      type: "card",
      title: `${label}: ${r.pattern}`,
      badge: r.contradiction ? "contradiction" : "consistent",
      tone: r.contradiction ? "warn" : "good",
      text: `Flagged in: ${flagged}\nPassed over in: ${passed}`,
    });
  }
}

export async function run(params, emit) {
  const mode = params.get("mode") ?? "saved";
  const codebase = loadCodebase(CODEBASE_DIR);

  if (mode === "saved") {
    const data = {
      single: loadResult("single-pass"),
      perFile: loadResult("per-file"),
      crossSummaries: loadResult("cross-file-summaries"),
      crossContracts: loadResult("cross-file-contracts"),
    };
    emitComparison(emit, buildComparison(data), "the saved runs, no cost");
    emit({ type: "section", title: "Same pattern, judged the same?" });
    emitContradictions(emit, "Single pass", data.single.issues);
    emitContradictions(emit, "Per-file", data.perFile.flatMap((r) => r.issues));
    return;
  }

  if (mode === "single") {
    emit({ type: "section", title: "Live single pass", text: "One call with all 12 files." });
    const result = await singlePassReview(codebase);
    for (const issue of result.issues) {
      emit({ type: "card", title: `${issue.file}:${issue.line}`, badge: issue.severity, tone: "tool", text: issue.description });
    }
    const score = scoreFindings(result.issues);
    emit({ type: "section", title: "Same pattern, judged the same?" });
    emitContradictions(emit, "This run", result.issues);
    emit({
      type: "summary",
      items: [
        [result.issues.length, "findings"],
        [`${score.found.size}/${DEFECTS.length}`, "planted defects matched"],
        [`$${estimateUsd([result.usage]).usd.toFixed(3)}`, "estimated cost"],
      ],
    });
    return;
  }

  if (mode === "multi") {
    emit({ type: "section", title: "Live per-file passes", text: "One call per file, one after another." });
    const reviews = await perFileReview(codebase, {
      onFile: (r) => emit({ type: "card", title: r.fileName, badge: `${r.bugCount} issues`, tone: "tool", text: r.issues.map((i) => `${i.line}: ${i.description}`).join("\n") || "No issues." }),
    });
    emit({ type: "section", title: "Live integration pass", text: "Summaries, the import graph and extracted contracts." });
    const cross = await crossFilePass(codebase, reviews, { mode: "contracts" });
    for (const issue of cross.issues) {
      emit({ type: "card", title: issue.files.join(" + "), badge: issue.severity, tone: "warn", text: issue.description });
    }
    const all = [...reviews.flatMap((r) => r.issues), ...cross.issues];
    emit({
      type: "summary",
      items: [
        [all.length, "findings"],
        [`${scoreFindings(all).found.size}/${DEFECTS.length}`, "planted defects matched"],
        [`$${estimateUsd([...reviews.map((r) => r.usage), cross.usage]).usd.toFixed(3)}`, "estimated cost"],
      ],
    });
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}
