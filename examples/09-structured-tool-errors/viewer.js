// Adapter between the central server and the recovery agent.

import { connectCustomerDb } from "./mcp-connection.js";
import { runRecoveryAgent, SCENARIOS } from "./recovery.js";

// Free: the raw response of every mode, straight from the MCP server.
async function showResponses(emit) {
  const db = await connectCustomerDb();
  try {
    emit({ type: "section", title: "Raw responses, no model", text: "Compare not_found with timeout: same empty hands, opposite meaning." });
    for (const mode of ["success", "not_found", "timeout", "invalid", "business", "permission", "crash"]) {
      const result = await db.callTool({ name: "customer_lookup", arguments: { identifier: "anna.weber@example.com", mode } });
      emit({
        type: "card", title: mode, badge: `isError: ${result.isError}`, tone: result.isError ? "warn" : "good",
        data: result.content[0].text,
      });
    }
  } finally {
    await db.close();
  }
}

export async function run(params, emit) {
  const name = params.get("scenario") ?? "responses";
  if (name === "responses") return showResponses(emit);

  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error("unknown scenario");
  emit({ type: "section", title: "Agent run", text: `User: ${scenario.prompt}. Planned failures: ${scenario.modes.join(", ") || "none"}.` });
  const { state, finalText, usage } = await runRecoveryAgent({ ...scenario, onEvent: emit });
  emit({ type: "card", title: "Answer", tone: "good", text: finalText });
  emit({
    type: "summary",
    items: [
      [state.serverCalls.length, "real server calls"],
      [state.actions.map((a) => a.action).join(", ") || "none", "recovery taken"],
      [state.escalations.length, "escalations"],
      [state.credentialRequests.length, "credential requests"],
      [state.refusedAfterStop.length, "calls refused after stop"],
      [usage.input_tokens + usage.output_tokens, "tokens"],
    ],
  });
}
