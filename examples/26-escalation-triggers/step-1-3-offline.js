// Steps 1 to 3, tested without a model: the prompt contains what it must, and matching exposes no record.

import { check, finishChecks } from "../../_shared/check.js";
import { CUSTOMERS } from "../../_fixtures/support.js";
import { createSession, CRITERIA, detectExplicitHumanRequest, EXAMPLES, handleCustomerLookup, searchCustomers, SYSTEM } from "./engine.js";

// Steps 1 and 2: the prompt.
check("All three triggers are numbered", /1\. EXPLICIT HUMAN REQUEST/.test(CRITERIA) && /2\. POLICY GAP/.test(CRITERIA) && /3\. INABILITY TO PROGRESS/.test(CRITERIA));
check("Each trigger has a description and an action", (CRITERIA.match(/Description:/g) ?? []).length === 3 && (CRITERIA.match(/Action:/g) ?? []).length === 3);
check("A gap is distinguished from a violation", /silent/.test(CRITERIA) && /violation/.test(CRITERIA));
check("Sentiment and confidence are excluded by name", /frustrated.*confidence.*sentiment/.test(CRITERIA));
check("Three examples, each with reasoning and action", (EXAMPLES.match(/Customer:/g) ?? []).length === 3 && (EXAMPLES.match(/Reasoning:/g) ?? []).length === 3 && (EXAMPLES.match(/Action:/g) ?? []).length === 3);
check("Criteria and examples are in the system prompt", SYSTEM.includes(CRITERIA) && SYSTEM.includes(EXAMPLES));

// Step 3: two tempting records. One looks far more likely, and it must make no difference.
const tempting = [
  { name: "John Smith", lastActive: "2024-05-20", city: "Leeds" },
  { name: "John Smith", lastActive: "2022-11-09", city: "Bristol" },
];
const outcome = handleCustomerLookup(tempting);
check("Two matches means disambiguate", outcome.action === "disambiguate" && outcome.matchCount === 2);
check("The result carries no record", !JSON.stringify(outcome).match(/Leeds|Bristol|2024-05-20/));
check("The message offers every identifier type", ["Email", "Phone", "Order", "Postcode"].every((word) => outcome.message.includes(word)));
check("No matches and one match work", handleCustomerLookup([]).action === "not_found" && handleCustomerLookup([tempting[0]]).action === "matched");

// The fixture's two John Smiths, through the real search.
check("The fixture has two John Smiths", CUSTOMERS.filter((c) => c.name === "John Smith").length === 2);
check("A name alone stays ambiguous", searchCustomers({ name: "John Smith" }).length === 2);
check("An email identifies one", searchCustomers({ name: "John Smith", email: "j.smith@example.org" })[0]?.id === "C-1004");
check("A phone identifies one", searchCustomers({ name: "John Smith", phone: "+44 20 5550103" })[0]?.id === "C-1003");
check("An order number identifies its owner", searchCustomers({ name: "John Smith", order_id: "ORD-900" })[0]?.id === "C-1003");
check("Someone else's order identifies nobody", searchCustomers({ name: "John Smith", order_id: "ORD-555" }).length === 0);
check("An empty search finds nothing", searchCustomers({}).length === 0);

// The code gates, called directly. This is the forced test of what the tool must refuse.
const session = createSession();
const raw = session.handleToolCall("get_customer", { name: "John Smith" });
check("The tool returns no customer ID or city on ambiguity", !/C-100|London|New York/.test(raw));
const guessed = session.handleToolCall("issue_replacement", { customer_id: "C-1003", order_id: "ORD-900" });
check("Guessing an ID after an ambiguous match is refused", guessed.isError === true && session.state.replacements.length === 0);
const read = session.handleToolCall("lookup_order", { customer_id: "C-1003", order_id: "ORD-900" });
check("Reading an order by guessed ID is refused", read.isError === true);
session.handleToolCall("get_customer", { name: "John Smith", email: "j.smith@example.org" });
const wrongOwner = session.handleToolCall("lookup_order", { customer_id: "C-1004", order_id: "ORD-900" });
check("Being identified does not unlock someone else's order", wrongOwner.isError === true);

// The human request detector.
const explicit = ["Connect me with a human.", "I'd like to talk with an actual person.", "Put a manager on the line.", "No more bots, let me talk with someone real.", "I need a person", "Give me someone real to speak to", "I want to speak with a real human.", "My order ORD-12345 arrived broken. Just get me a human."];
const notExplicit = ["I am SO fed up! My order showed up damaged!", "I already spoke to a person and they were lovely, I just need the refund.", "My manager approved this purchase.", "Nobody seems to care about my package!", "Is the human-sized chair in stock?"];
for (const text of explicit) check(`Detected: "${text}"`, detectExplicitHumanRequest(text));
for (const text of notExplicit) check(`Not detected: "${text}"`, !detectExplicitHumanRequest(text));

finishChecks();
