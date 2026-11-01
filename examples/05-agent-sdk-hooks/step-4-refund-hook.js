// The refund limit, through the real hook and tool, with no model.

import { check, finishChecks } from "../../_shared/check.js";
import { createHarness } from "./harness.js";

const { callTool, ran, policy } = createHarness();

const high = await callTool("process_refund", { customer_id: "C-001", amount: 750 });
console.log(high.message);
check("A refund of 750 is blocked", high.blocked === true);
check("The block names an escalation reference", /ESC-\d+/.test(high.message), high.message);
check("The refund tool did not execute", ran("process_refund").length === 0);
check("The case is in the human queue", policy.escalations.length === 1 && policy.escalations[0].amount === 750);

const again = await callTool("process_refund", { customer_id: "C-001", amount: 750 });
check("A retry does not open a second escalation", again.blocked && policy.escalations.length === 1);

const low = await callTool("process_refund", { customer_id: "C-001", amount: 200 });
check("A refund of 200 runs", low.blocked === false && low.data.status === "refunded");
check("It executed exactly once", ran("process_refund").length === 1);

const edge = await callTool("process_refund", { customer_id: "C-001", amount: 500 });
check("Exactly 500 is allowed, since the rule is 'exceeds'", edge.blocked === false);
const justOver = await callTool("process_refund", { customer_id: "C-001", amount: 500.01 });
check("500.01 is blocked", justOver.blocked === true);

const text = await callTool("process_refund", { customer_id: "C-001", amount: "lots" });
check("An unreadable amount is refused, not waved through", text.blocked === true, text.message);

const crash = await callTool("process_refund", null);
check("A policy that crashes refuses the call", crash.blocked === true, crash.message);

// Known limit of this rule, stated rather than hidden: it looks at one call at a time.
const split = createHarness();
await split.callTool("process_refund", { customer_id: "C-001", amount: 400 });
await split.callTool("process_refund", { customer_id: "C-001", amount: 400 });
check(
  "Known gap: two refunds of 400 both pass, because the limit is per call",
  split.ran("process_refund").length === 2
);

finishChecks();
