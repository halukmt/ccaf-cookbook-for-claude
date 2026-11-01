// Step 3: trim a 40+ field result to 5 fields and measure the reduction with the token counting endpoint,
// which is not billed. Character counts are shown as well, as they are not the same thing.

import { check, finishChecks } from "../../_shared/check.js";
import { client, MODEL } from "../../_shared/client.js";
import { resultStore } from "../../_shared/results.js";
import { REFUND_FIELDS, trimToolResult } from "./case-facts.js";
import { lookupOrder } from "./order-data.js";

const store = resultStore(import.meta.url);

async function tokensFor(content) {
  const { input_tokens } = await client.messages.countTokens({ model: MODEL, messages: [{ role: "user", content }] });
  return input_tokens;
}

const raw = lookupOrder("8891");
const trimmed = trimToolResult(raw);
const empty = await tokensFor("x"); // Overhead of a minimal message, removed from both sides.
const rawTokens = (await tokensFor(JSON.stringify(raw))) - empty;
const trimmedTokens = (await tokensFor(JSON.stringify(trimmed))) - empty;
const reduction = 1 - trimmedTokens / rawTokens;

console.log(`Fields: ${Object.keys(raw).length} -> ${Object.keys(trimmed).length}`);
console.log(`Tokens: ${rawTokens} -> ${trimmedTokens}, ${(reduction * 100).toFixed(1)}% smaller`);
console.log(`Characters: ${JSON.stringify(raw).length} -> ${JSON.stringify(trimmed).length}`);
console.log(JSON.stringify(trimmed));

check("The raw result has 40 or more fields", Object.keys(raw).length >= 40, `${Object.keys(raw).length}`);
check("The trimmed result has exactly the 5 fields", Object.keys(trimmed).length === 5 && REFUND_FIELDS.every((f) => f in trimmed));
check("Trimmed values are unchanged", REFUND_FIELDS.every((f) => trimmed[f] === raw[f]));
check("Token counts are real, non-zero numbers", rawTokens > 0 && trimmedTokens > 0);
check("Trimming removes at least 80% of the tokens", reduction >= 0.8, `${(reduction * 100).toFixed(1)}%, measured`);

store.save("trim", {
  fieldsBefore: Object.keys(raw).length, fieldsAfter: Object.keys(trimmed).length, rawTokens, trimmedTokens, reduction,
  rawChars: JSON.stringify(raw).length, trimmedChars: JSON.stringify(trimmed).length,
});
finishChecks();
