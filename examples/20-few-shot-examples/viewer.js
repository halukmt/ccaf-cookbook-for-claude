// Adapter between the central server and the extraction prompts.
// "saved" re-reads fixed results at no cost. "live" makes two small calls on one document.

import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { documentText, getDocument, scoreExtraction } from "../../_fixtures/documents-answers.js";
import { BASE_PROMPT, FEW_SHOT_EXAMPLES, FIELDS, extractDocument, failureLog, fewShotPrompt, formatProblems, measure, pct } from "./extract.js";

const store = resultStore(import.meta.url);

function emitSaved(emit) {
  const baseline = store.load("baseline");
  const fewShot = store.load("few-shot");
  emit({ type: "section", title: "Baseline against few-shot", text: "Ten documents, three runs each, scored field by field against the answer key." });
  for (const [name, runs] of [["No examples", baseline], ["Three examples with reasoning", fewShot]]) {
    const m = measure(runs);
    emit({ type: "summary", items: [
      [name, "prompt"],
      [`${pct(m.accuracy)} of ${m.tally.fields}`, "fields right"],
      [`${m.tally.empty} of ${m.tally.present}`, "empty, data exists"],
      [`${m.tally.fabricated} of ${m.tally.absent}`, "invented, data absent"],
      [`${m.wellFormed} of ${m.answers}`, "bare JSON"],
    ] });
  }
  emit({ type: "section", title: "Outcome by structure", text: "Counts over three runs." });
  for (const [name, runs] of [["No examples", baseline], ["With examples", fewShot]]) {
    emit({ type: "card", title: name, tone: "muted", data: failureLog(runs) });
  }
  emit({ type: "section", title: "Which technique for which problem" });
  for (const row of store.load("matrix").matrix) {
    emit({ type: "card", title: row.problem, badge: row.technique, tone: "tool", text: `No examples: ${row.baseline}\nWith examples: ${row.fewShot}\n${row.verdict}` });
  }
  emit({ type: "section", title: "The three examples" });
  for (const example of FEW_SHOT_EXAMPLES) {
    emit({ type: "card", title: example.structure, tone: "muted", text: example.reasoning, data: { input: example.input, output: example.output } });
  }
}

async function emitLive(params, emit) {
  const doc = getDocument(params.get("doc"));
  emit({ type: "card", title: doc.file, badge: doc.structure, tone: "tool", data: documentText(doc) });
  let cost = 0;
  for (const [name, prompt] of [["No examples", BASE_PROMPT], ["Three examples", fewShotPrompt()]]) {
    const row = await extractDocument(prompt, doc);
    cost += estimateCost(FAST_MODEL, row.usage);
    const outcomes = scoreExtraction(doc, row.output, FIELDS);
    const allRight = Object.values(outcomes).every((o) => o === "correct" || o === "correct_null");
    emit({ type: "card", title: name, badge: allRight ? "matches the key" : "differs from the key", tone: allRight ? "good" : "warn", text: JSON.stringify(outcomes), data: { output: row.output, format: formatProblems(row) } });
  }
  emit({ type: "summary", items: [[usd(cost), "estimated from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
