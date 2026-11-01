// Adapter between the central server and the support agent.

import { runSupportAgent } from "./support-agent.js";

export async function run(params, emit) {
  const prompt = params.get("prompt")?.trim();
  if (!prompt) throw new Error("missing prompt");

  emit({ type: "section", title: "Tool calls", text: "A red call was stopped by code, whatever the model intended." });
  const { state, finalText } = await runSupportAgent(prompt, { onEvent: emit });

  for (const handoff of state.handoffs) {
    emit({ type: "card", title: "Handoff to a human", badge: "self-contained", tone: "tool", data: handoff });
  }
  emit({ type: "card", title: "Answer to the customer", tone: "good", text: finalText });
  emit({
    type: "summary",
    items: [
      [state.blocked.length, "attempts blocked by the gate"],
      [state.refunds.length, "refunds processed"],
      [state.handoffs.length, "handoffs"],
    ],
  });
}
