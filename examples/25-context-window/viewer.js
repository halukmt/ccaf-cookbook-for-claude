// Adapter between the central server and the context manager.
// "saved" re-reads a fixed run at no cost. "live" makes one short call with the given summary.

import { client, MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { buildPrompt } from "./case-facts.js";
import { KNOWN_FACTS, scoreFacts, SYSTEM } from "./conversation.js";

const store = resultStore(import.meta.url);

function emitSaved(emit) {
  const trim = store.load("trim");
  const tokens = store.load("token-reduction");
  const run = store.load("conversation");
  const keys = store.load("key-findings-score");

  emit({ type: "section", title: "Trimming", text: "Measured with the token counting endpoint." });
  emit({ type: "summary", items: [
    [`${trim.fieldsBefore} to ${trim.fieldsAfter}`, "fields in one result"],
    [`${trim.rawTokens} to ${trim.trimmedTokens}`, "tokens in one result"],
    [`${(trim.reduction * 100).toFixed(1)}%`, "one result"],
    [`${((1 - tokens.trimmedTokens / tokens.rawTokens) * 100).toFixed(1)}%`, "the whole last request"],
  ] });
  emit({ type: "card", title: "The API keeps nothing, so history is resent", tone: "muted", text: `Input tokens per turn, full-history conversation: ${tokens.perTurnInput.join(", ")}. A turn with a tool call is two requests.` });

  emit({ type: "section", title: `What survives in the final answer, of ${KNOWN_FACTS.length} known values`, text: "Ten real turns, with summaries written by the model. The tools stayed available, so an agent could look orders up again." });
  for (const arm of run.arms) {
    const score = scoreFacts(arm.answer);
    const last = arm.summaries.at(-1);
    emit({
      type: "card", title: arm.label, badge: `${score.survived.length} of ${KNOWN_FACTS.length}`,
      tone: score.lost.length ? "warn" : "good",
      text: `Lost: ${score.lost.join("; ") || "nothing"}\nOrders looked up again: ${arm.relookups}` +
        (last ? `\nLast summary held ${scoreFacts(last.text).survived.length} of ${KNOWN_FACTS.length}: ${last.text}` : ""),
    });
  }

  emit({ type: "section", title: "A hand-written lossy summary", text: `Forced: the author of "${run.forced.summary}" removed the facts.` });
  emit({ type: "card", title: "With the block", tone: "good", text: run.forced.with });
  emit({ type: "card", title: "Without the block", tone: "warn", text: run.forced.without });

  emit({ type: "section", title: "Key findings first", text: `One run per arm, ${keys.inputTokens} input tokens, recalls at the start, middle and end of 80 reports.` });
  emit({ type: "summary", items: [
    [`${keys.flat.length} of ${keys.expected.length}`, "flat input"],
    [`${keys.keyFirst.length} of ${keys.expected.length}`, "key findings first"],
  ] });
}

async function emitLive(params, emit) {
  const summary = params.get("summary")?.trim();
  if (!summary) throw new Error("missing summary");
  const facts = params.get("block") === "on" ? { orderId: "#8891", refundAmount: "$247.83", orderDate: "2024-03-03" } : null;
  const messages = buildPrompt(facts, summary, "Please confirm the refund details.");
  emit({ type: "card", title: "First message sent", tone: "tool", text: messages[0].content });
  const response = await client.messages.create({ model: MODEL, max_tokens: 1000, system: SYSTEM, messages });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  emit({ type: "card", title: "Agent", tone: facts ? "good" : "muted", text });
  emit({ type: "check", label: "Refund amount in the answer", pass: /247\.83/.test(text) });
  emit({ type: "check", label: "Order number in the answer", pass: /8891/.test(text) });
  emit({ type: "summary", items: [[usd(estimateCost(MODEL, response.usage)), "computed from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitLive(params, emit);
}
