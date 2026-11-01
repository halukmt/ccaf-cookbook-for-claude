// Adapter between the central server and the explorer.
// "saved" re-reads the fixed runs at no cost. "live" explores one question on Haiku, in a temporary copy.

import { FAST_MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { delegateToSubagent } from "./explorer.js";
import { INVESTIGATIONS, TRUTH } from "./tasks.js";
import { createWorkspace } from "./workspace.js";

const store = resultStore(import.meta.url);

function emitSaved(emit) {
  const phase1 = store.load("phase1");
  const size = store.load("phase1-size");
  const phase2 = store.load("phase2");
  const reads = store.load("phase2-score");
  const crash = store.load("crash-resume");
  const score = store.load("comparison-score");

  emit({ type: "section", title: "Isolation", text: "Subagents read the code. The coordinator keeps their structured findings." });
  emit({ type: "summary", items: [[size.subagentInput, "input tokens the subagents used"], [size.contextTokens, "tokens the coordinator holds"], [size.codeTokens, "tokens in the whole codebase"]] });
  for (const r of phase1.results) emit({ type: "card", title: r.task, badge: `${r.filesRead.length} reads`, tone: "muted", text: r.findings.at(-1).summary });

  emit({ type: "section", title: "The scratchpad", text: "A real file written during the run." });
  emit({ type: "card", title: "exploration-scratchpad.md", tone: "muted", data: phase1.scratchpad.trim() });

  emit({ type: "section", title: "Phase 2, with the summary injected", text: `${reads.reReads} of ${reads.reads} reads were files Phase 1 had also read, so the summary did not remove re-reading.` });
  emit({ type: "card", title: "Injected summary", tone: "tool", data: phase2.summary });
  for (const f of reads.found) emit({ type: "card", title: `Planted defect ${f.defect}`, badge: f.found ? "found" : "missed", tone: f.found ? "good" : "warn" });

  emit({ type: "section", title: "A crash and a resume", text: "The crash is forced: the process dies on its first file read of the third task." });
  for (const entry of crash.log) emit({ type: "card", title: `${entry.event}${entry.task ? `: ${entry.task}` : ""}`, badge: `pid ${entry.pid}`, tone: entry.event === "simulated_crash" ? "warn" : entry.event === "resumed" ? "good" : "muted" });
  emit({ type: "card", title: "Manifest at the crash", tone: "tool", data: { sessionId: crash.afterCrash.sessionId, exploredPaths: crash.afterCrash.exploredPaths, nextSteps: crash.afterCrash.nextSteps, findings: crash.afterCrash.keyFindings.map((f) => f.task) } });

  emit({ type: "section", title: "Does a scratchpad help?", text: "One run per arm on Haiku 5.5, twelve small modules. Real exports are the key. Dropping tool history is forced, to stand in for compaction." });
  for (const a of score) {
    emit({
      type: "card", title: a.label, badge: `${a.correct} of ${a.expected}`, tone: a.correct === a.expected ? "good" : "warn",
      text: `Wrong: ${a.wrong.join(", ") || "none"}. Input tokens: ${a.inputTokens}. Generic phrases: ${a.specificity.genericRefs}.\n\n${a.answer}`,
    });
  }
}

async function emitLive(params, emit) {
  const task = INVESTIGATIONS.find((t) => t.subagent === params.get("task"));
  if (!task) throw new Error("Unknown task");
  const { code } = createWorkspace();
  const result = await delegateToSubagent(task, { code, model: FAST_MODEL, onEvent: emit });
  emit({ type: "card", title: "Structured findings the coordinator would get", tone: "good", data: result.findings });
  const truth = TRUTH[task.subagent](result.findings);
  emit({ type: "check", label: "Agrees with the real code", pass: truth.pass, detail: truth.detail });
  emit({ type: "summary", items: [[usd(estimateCost(FAST_MODEL, result.usage)), "computed from tokens and list price"], [result.filesRead.length, "files read"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
