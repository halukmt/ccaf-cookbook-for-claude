// Steps 1 and 2: extraction and prompt construction, tested on known values. No model, no cost.

import { check, finishChecks } from "../../_shared/check.js";
import { buildPrompt, CASE_FACTS_HEADER, extractCaseFacts, mergeCaseFacts, trimToolResult } from "./case-facts.js";
import { lookupOrder, RAW_RETURN } from "./order-data.js";

const raw = lookupOrder("#8891");
const facts = extractCaseFacts(raw);

check("Customer ID is extracted exactly", facts.customerId === "C-4471");
const [issue] = facts.issues;
check("Amount, date, order number and status are exact", issue.orderTotal === 247.83 && issue.orderDate === "2024-03-03" && issue.orderId === "#8891" && issue.status === "delivered");
const text = JSON.stringify(facts);
check("Narrative content stays out", !/dishwasher|quietest|Friendly|Delivered, signed/.test(text));
check("Operational noise stays out", !/tok_9f2c|WH-LEEDS|sess_71ac|fraud/.test(text));

const merged = mergeCaseFacts(mergeCaseFacts(facts, extractCaseFacts(lookupOrder("8917"))), extractCaseFacts(RAW_RETURN));
console.log(JSON.stringify(merged, null, 2));
check("A second order becomes a second issue", merged.issues.length === 2);
const first = merged.issues.find((i) => i.orderId === "#8891");
check("A later return joins the same issue without losing the amount", first.rmaId === "RMA-55210" && first.netRefund === 235.33 && first.orderTotal === 247.83);
check("The customer ID survives a tool result that has none", merged.customerId === "C-4471");

// The order matters: the trim list has no customer_id and no status.
const fromTrimmed = extractCaseFacts(trimToolResult(raw));
check("Extracting after trimming loses customer ID and status, so extraction must run first",
  fromTrimmed.customerId === undefined && fromTrimmed.issues[0].status === undefined);

const withBlock = buildPrompt(merged, "Customer wants a refund.", "Confirm please.");
const withoutBlock = buildPrompt(null, "Customer wants a refund.", "Confirm please.");
check("The block comes first, under its header", withBlock[0].content.startsWith(CASE_FACTS_HEADER));
check("Exact values are in the block", withBlock[0].content.includes("247.83") && withBlock[0].content.includes("RMA-55210"));
check("The summary follows the block", withBlock[0].content.indexOf("## Conversation summary") > withBlock[0].content.indexOf("RMA-55210"));
check("The current turn is last", withBlock.at(-1).role === "user" && withBlock.at(-1).content === "Confirm please.");
check("No block means no header and no literal null", !withoutBlock[0].content.includes(CASE_FACTS_HEADER) && !withoutBlock[0].content.includes("null"));

const recent = [{ role: "user", content: "old" }, { role: "assistant", content: "reply" }];
const later = buildPrompt(merged, "s", "now", recent);
check("Turns since the summary sit between the summary and the current turn", later[2].content === "old" && later[3].content === "reply" && later.at(-1).content === "now");

finishChecks();
