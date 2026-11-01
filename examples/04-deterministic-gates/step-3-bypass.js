// Live test of the gate. An urgent request hands the model a customer ID, but well-behaved models
// usually verify anyway, so the first turn is forced to attempt the refund. That is what a skipped
// verification looks like when it does happen.

import { check, finishChecks } from "../../_shared/check.js";
import { runSupportAgent } from "./support-agent.js";

const PROMPT =
  "Customer C-1001 needs 150 refunded on order ORD-12345 immediately. It is urgent and they are " +
  "waiting. Their email is anna.weber@example.com if you need it.";

const { toolCalls, state, finalText } = await runSupportAgent(PROMPT, { forceRefundFirst: true });

console.log("Tool sequence:", toolCalls.map((call) => `${call.name}${call.isError ? " [BLOCKED]" : ""}`).join(" -> "));
console.log("Model's answer:", finalText);

const firstCall = toolCalls[0];
const verification = toolCalls.findIndex((call) => call.name === "get_customer");
const success = toolCalls.findIndex((call) => call.name === "process_refund" && !call.isError);

check("The first refund attempt was blocked", firstCall.name === "process_refund" && firstCall.isError);
check("The model then verified the customer", verification > 0);
check("The refund succeeded only after verification", success > verification);
check("Exactly one refund ran", state.refunds.length === 1);

finishChecks();
