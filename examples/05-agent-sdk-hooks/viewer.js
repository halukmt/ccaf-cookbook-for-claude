// Adapter between the central server and the hooked agent.

import { runBankAgent } from "./agent.js";

function hookCard(event) {
  if (event.hook === "PreToolUse") {
    return event.blocked
      ? { type: "card", title: `PreToolUse: ${event.tool}`, badge: "blocked before execution", tone: "warn", text: event.message, data: event.input }
      : { type: "card", title: `PreToolUse: ${event.tool}`, badge: "allowed", tone: "muted", data: event.input };
  }
  return {
    type: "card",
    title: `PostToolUse: ${event.tool}`,
    badge: "normalised",
    tone: "tool",
    data: { tool_returned: event.raw, model_receives: event.normalised },
  };
}

export async function run(params, emit) {
  const prompt = params.get("prompt")?.trim();
  if (!prompt) throw new Error("missing prompt");
  const hooksEnabled = params.get("hooks") !== "off";
  const refundLimit = Number(params.get("limit") || 500);

  emit({
    type: "section",
    title: "Hook decisions",
    text: hooksEnabled
      ? "Pre runs before the tool and can stop it. Post runs after the tool and rewrites what the model reads."
      : "Hooks are off: nothing here can stop a call or clean up a result.",
  });
  const result = await runBankAgent(prompt, {
    hooksEnabled,
    refundLimit,
    onEvent: (event) => emit(hookCard(event)),
  });

  emit({ type: "section", title: "What the API request contained", text: "Captured on the wire, not taken from a log." });
  for (const sent of result.toolResults) {
    emit({ type: "tool", name: sent.toolName, input: {}, result: sent.text, isError: sent.isError });
  }

  emit({ type: "section", title: "Ledger", text: "Tools that really executed. A blocked tool is not listed here." });
  emit({ type: "card", title: "Executed", tone: "tool", data: result.executed });
  if (result.policy.escalations.length) {
    emit({ type: "card", title: "Human escalation queue", tone: "warn", data: result.policy.escalations });
  }
  emit({ type: "card", title: "Answer", tone: "good", text: result.finalText });

  const overLimit = result.executed.filter((c) => c.name === "process_refund" && c.input.amount > refundLimit);
  const transferred = result.executed.filter((c) => c.name === "transfer_funds");
  const unchecked = transferred.filter(
    (c) => !result.executed.some((e) => e.name === "aml_check" && e.input.customer_id === c.input.customer_id)
  );
  emit({ type: "section", title: "Invariants" });
  const invariant = (label, pass, detail) => emit({ type: "check", label, pass, detail });
  invariant(`No refund above ${refundLimit} executed`, overLimit.length === 0, `${overLimit.length} over the limit`);
  invariant("No transfer executed without an AML check", unchecked.length === 0, `${transferred.length} transfers`);

  emit({
    type: "summary",
    items: [
      [result.policy.blocked.length, "calls blocked"],
      [result.executed.length, "tools executed"],
      [result.policy.escalations.length, "escalations"],
      [`$${result.costUsd.toFixed(3)}`, "cost"],
    ],
  });
}
