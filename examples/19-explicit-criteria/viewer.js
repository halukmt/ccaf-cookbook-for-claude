// Adapter between the central server and the review prompts.
// "saved" re-reads fixed results at no cost. "live" makes two small calls on one snippet.

import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { SNIPPETS } from "../../_fixtures/review-snippets.js";
import { EXPLICIT_PROMPT, VAGUE_PROMPT, classify, pct, summarise, topSeverity } from "./review.js";
import { decideCategories } from "./trust-recovery.js";

const store = resultStore(import.meta.url);

function emitSaved(emit) {
  const data = store.load("step-4-compare");
  const refined = store.load("step-5-refined");
  emit({ type: "section", title: "Vague against explicit", text: `Three runs per prompt over ${SNIPPETS.length} labelled snippets on ${data.model}. Each rate is computed from the labels.` });
  for (const [name, runs] of [["Vague", data.vague], ["Explicit", data.explicit], ["Explicit plus edge-case examples", refined.runs]]) {
    const s = summarise(runs, SNIPPETS);
    emit({ type: "summary", items: [
      [name, "prompt"],
      [`${pct(s.falsePositiveRate)} of ${s.falsePositiveSample}`, "false positives"],
      [`${pct(s.recall)} of ${s.recallSample}`, "real issues found"],
      [`${pct(s.inconsistency.rate)} of ${s.inconsistency.sample}`, "snippets unstable across runs"],
    ] });
  }

  emit({ type: "section", title: "Flag count per snippet, out of three runs", text: "Top half should be 3. Bottom half should be 0." });
  emit({
    type: "card",
    title: "How often each snippet was flagged",
    tone: "muted",
    text: SNIPPETS.map((s) => {
      const flagged = (runs) => runs.filter((rows) => rows.find((r) => r.id === s.id).findings.length > 0).length;
      return `${s.id.padEnd(27)} ${s.report ? "report" : "skip  "}   vague ${flagged(data.vague)}   explicit ${flagged(data.explicit)}   refined ${flagged(refined.runs)}`;
    }).join("\n"),
  });

  emit({ type: "section", title: "Categories above the 25% threshold", text: "On the explicit prompt, measured on few findings, so the sample stands next to each rate." });
  for (const d of decideCategories(data.explicit, SNIPPETS)) {
    emit({ type: "card", title: d.category, badge: d.action, tone: d.action === "disable" ? "warn" : "good", text: `${pct(d.fpRate)} false positives, of ${d.judged} judged findings` });
  }
}

async function emitLive(params, emit) {
  const snippet = SNIPPETS.find((s) => s.id === params.get("snippet"));
  if (!snippet) throw new Error("Unknown snippet");
  emit({ type: "card", title: snippet.id, badge: snippet.report ? `should report: ${snippet.severity}` : "should skip", tone: "tool", data: snippet.code });
  let cost = 0;
  for (const [name, prompt] of [["Vague prompt", VAGUE_PROMPT], ["Explicit prompt", EXPLICIT_PROMPT]]) {
    const { findings, usage } = await classify(prompt, snippet.code);
    cost += estimateCost(FAST_MODEL, usage);
    const right = snippet.report ? findings.length > 0 : findings.length === 0;
    emit({
      type: "card",
      title: name,
      badge: topSeverity(findings),
      tone: right ? "good" : "warn",
      text: findings.map((f) => `[${f.severity}, ${f.category}] ${f.description}`).join("\n") || "No findings.",
    });
  }
  emit({ type: "summary", items: [[usd(cost), "estimated from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
