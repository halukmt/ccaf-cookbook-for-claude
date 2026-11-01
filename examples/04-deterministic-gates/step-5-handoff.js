// Live test: one request with three concerns must produce one complete handoff.

import { check, finishChecks } from "../../_shared/check.js";
import { handoffProblems, runSupportAgent } from "./support-agent.js";

const PROMPT =
  "I'm Anna Weber, anna.weber@example.com. I want to send back order ORD-789, I dispute a 45.00 charge " +
  "on my last bill, and my shipping address should change to 123 New Street.";

const { toolCalls, state, finalText } = await runSupportAgent(PROMPT);
console.log("Tool sequence:", toolCalls.map((call) => call.name).join(" -> "));

const handoff = state.handoffs.at(-1);
console.log("Handoff:", JSON.stringify(handoff, null, 2));
console.log("Model's answer:", finalText);

check("A handoff was created", Boolean(handoff));
if (handoff) {
  const covered = `${handoff.conversation_summary} ${handoff.recommended_action}`.toLowerCase();
  check("Handoff passes the completeness check", handoffProblems(handoff).length === 0);
  check("Handoff names the verified customer", handoff.customer_id === "C-1001");
  check("Covers the return", /return|ord-789/.test(covered));
  check("Covers the billing dispute", /dispute|45/.test(covered));
  check("Covers the address update", /address|123 new street/.test(covered));
}

finishChecks();
