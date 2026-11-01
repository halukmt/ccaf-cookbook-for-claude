// Tests the gate directly, with no model involved and no API cost.

import { check, finishChecks } from "../../_shared/check.js";
import { createSupportSession } from "./support-agent.js";

const session = createSupportSession();
const refund = { customer_id: "C-1001", amount: 150 };

const before = session.handleToolCall("process_refund", refund);
check("Refund is blocked before verification", before.isError && before.content.startsWith("BLOCKED"));
check("No refund ran", session.state.refunds.length === 0);

session.handleToolCall("get_customer", { query: "anna.weber@example.com" });
const after = session.handleToolCall("process_refund", refund);
check("Refund runs after verification", typeof after === "string" && session.state.refunds.length === 1);

const other = session.handleToolCall("process_refund", { customer_id: "C-1003", amount: 780 });
check("Verifying one customer does not unlock another", other.isError === true);

session.handleToolCall("get_customer", { query: "ben.hartmann@example.com" });
const unverified = session.handleToolCall("process_refund", { customer_id: "C-1002", amount: 320 });
check("A customer who fails verification stays blocked", unverified.isError === true);

session.handleToolCall("get_customer", { query: "John Smith" });
const ambiguous = session.handleToolCall("process_refund", { customer_id: "C-1003", amount: 10 });
check("An ambiguous name verifies nobody", ambiguous.isError === true);

const fresh = createSupportSession();
const leaked = fresh.handleToolCall("process_refund", refund);
check("Verification does not leak into a new session", leaked.isError === true);

finishChecks();
