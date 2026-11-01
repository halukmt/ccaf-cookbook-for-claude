// Three tools, three formats, no model. Shows the mess the hook has to clean up.

import { check, finishChecks } from "../../_shared/check.js";
import { createBankTools } from "./tools.js";

const state = { executed: [] };
const tools = Object.fromEntries(createBankTools(state).map((t) => [t.name, t]));

const read = async (name, input) => JSON.parse((await tools[name].handler(input, {})).content[0].text);

const a = await read("get_customer", { customer_id: "C-001" });
const b = await read("get_order", { order_id: "ORD-42" });
const c = await read("get_shipment", { shipment_id: "SHP-7" });
console.log({ a, b, c });

check("Tool A uses epoch seconds and a numeric status", a.created_at === 1710489600 && a.status === 200);
check("Tool B uses ISO 8601 and a word status", b.created_at === "2024-03-15T12:00:00Z" && b.status === "active");
check("Tool C uses DD/MM/YYYY and a one-letter status", c.created_at === "15/03/2024" && c.status === "S");
check("The ledger records each execution", state.executed.length === 3);
check("All six tools exist", Object.keys(tools).length === 6, Object.keys(tools).join(", "));

finishChecks();
