// Adapter between the central server and the escalation engine.
// "saved" re-reads the fixed runs at no cost. "live" runs one customer message.

import { MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { detectExplicitHumanRequest, processScenario } from "./engine.js";

const store = resultStore(import.meta.url);
const TONE = { escalate_immediate: "tool", escalate: "tool", disambiguate: "warn", resolved: "good", replied: "good" };

function card(emit, result) {
  emit({
    type: "card", title: result.input, badge: result.action, tone: TONE[result.action] ?? "muted",
    text: `${result.text}\n\nTools: ${result.tools.join(" > ") || "none"}. Steps before any escalation: ${result.investigationSteps}. Trigger: ${result.trigger ?? "none"}. Decided by: ${result.decidedBy}.`,
  });
}

function emitSaved(emit) {
  const scenarios = store.load("scenarios");
  const rules = store.load("absolute-rules");
  const score = store.load("absolute-rules-score");
  emit({ type: "section", title: "The scenarios, prompt only", text: "One run each. The four core cases come first. tool-failure is forced: the order system is simulated as down." });
  for (const result of scenarios.results) card(emit, result);
  emit({ type: "section", title: "Explicit human requests, prompt only", text: "Must escalate at once. The code gate would catch these with no model call; here it was off." });
  emit({ type: "summary", items: [[`${score.heldHuman} of ${score.humanTotal}`, "escalated with no investigation"]] });
  for (const result of rules.promptOnly) card(emit, result);
  emit({ type: "section", title: "A phrasing the detector misses", text: "The code gate does not fire here, so only the prompt protects this customer." });
  card(emit, rules.implicitGateOn);
  emit({ type: "section", title: "Tempting ambiguity", text: "Safe tool: no record is ever returned, so choosing is impossible. Exposed tool: every record is handed over, and only the prompt says not to choose." });
  for (const result of rules.safeTool) card(emit, { ...result, input: `Safe tool: ${result.input}` });
  for (const result of rules.exposedTool) card(emit, { ...result, input: `Exposed tool: ${result.input}` });
  emit({ type: "summary", items: [[`${score.heldExposed} of ${score.exposedTotal}`, "exposed tool: no selection, no leak"]] });
}

async function emitLive(params, emit) {
  const message = params.get("message")?.trim();
  if (!message) throw new Error("missing message");
  const codeGate = params.get("gate") === "on";
  emit({ type: "card", title: "Detector", badge: detectExplicitHumanRequest(message) ? "fires" : "quiet", tone: "muted", text: codeGate ? "Gate on: if it fires, the model is not called." : "Gate off: the prompt decides." });
  const result = await processScenario(message, { codeGate, exposeRecords: params.get("tool") === "exposed", onEvent: emit });
  card(emit, result);
  emit({ type: "summary", items: [[usd(estimateCost(MODEL, result.usage)), "computed from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
