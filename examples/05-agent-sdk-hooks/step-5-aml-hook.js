// The AML prerequisite, through the real hooks and tools, with no model.

import { check, finishChecks } from "../../_shared/check.js";
import { createHarness } from "./harness.js";

const transfer = (customer_id) => ({ customer_id, to: "IBAN-123", amount: 10000 });
const { callTool, ran } = createHarness();

const before = await callTool("transfer_funds", transfer("C-001"));
console.log(before.message);
check("A transfer without AML is blocked", before.blocked === true && before.message.startsWith("COMPLIANCE BLOCK"));
check("The transfer tool did not execute", ran("transfer_funds").length === 0);

const failed = await callTool("aml_check", { customer_id: "C-002" });
check("The AML tool itself is allowed and returns fail", failed.blocked === false && failed.data.status === "fail");
const afterFail = await callTool("transfer_funds", transfer("C-002"));
check("A failed check keeps the transfer blocked", afterFail.blocked === true);

const passed = await callTool("aml_check", { customer_id: "C-001" });
check("C-001 passes AML", passed.data.status === "pass");
const other = await callTool("transfer_funds", transfer("C-002"));
check("One customer's pass does not unlock another's transfer", other.blocked === true);
check("Still nothing transferred", ran("transfer_funds").length === 0);

const after = await callTool("transfer_funds", transfer("C-001"));
check("After passing AML the transfer runs", after.blocked === false && after.data.status === "transferred");
check("It executed exactly once", ran("transfer_funds").length === 1);

const fresh = createHarness();
const leaked = await fresh.callTool("transfer_funds", transfer("C-001"));
check("A new session starts blocked again", leaked.blocked === true);

finishChecks();
