// Steps 3 and 4: the retry loop on seven documents: two fixable, three with absent information, and
// two whose own figures are wrong. First natural passes, then seeded failures on the fixable two.
// Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { documentText, getDocument, lineItemSum } from "../../_fixtures/documents-answers.js";
import { sumOf } from "./extraction.js";
import { runLoop } from "./retry-loop.js";
import { SEEDED } from "./seeded-failures.js";

const SETS = {
  fixable: ["d10", "d18"],
  absent: ["d13", "d03", "d20"],
  sourceError: ["d16", "d17"],
};
const store = resultStore(import.meta.url);

const data = await store.runOnce("loop", async () => {
  const natural = {};
  for (const id of Object.values(SETS).flat()) natural[id] = await runLoop(documentText(getDocument(id)));
  const seeded = {};
  for (const id of SETS.fixable) seeded[id] = await runLoop(documentText(getDocument(id)), { seeded: SEEDED[id] });
  return { natural, seeded };
});

const row = (id, r, set) => ({
  doc: id,
  set,
  firstErrors: r.firstErrors.map((e) => e.code).join(", ") || "none",
  retries: r.retries,
  status: r.status,
  endErrors: r.errors.map((e) => `${e.code}:${e.field}`).join(", ") || "none",
  stated: r.result.stated_total,
  sum: lineItemSum(r.result.line_items ?? []),
});
const setOf = (id) => Object.keys(SETS).find((k) => SETS[k].includes(id));
console.log("Natural first passes:");
console.table(Object.entries(data.natural).map(([id, r]) => row(id, r, setOf(id))));
console.log("Seeded failure, then real retries:");
console.table(Object.entries(data.seeded).map(([id, r]) => row(id, r, "fixable, seeded")));

for (const [id, r] of Object.entries(data.seeded)) {
  console.log(`${id}, model's own figures after the last retry: calculated_total ${r.modelResult.calculated_total}, conflict_detected ${r.modelResult.conflict_detected}. Advisories: ${r.advisories.map((e) => e.code).join(", ") || "none"}`);
}

const showRetry = data.seeded.d10.history[1];
console.log("The retry message for d10:\n", showRetry.message.slice(0, 900));

const all = [...Object.values(data.natural), ...Object.values(data.seeded)];
console.log(`\nAbout ${usd(estimateCost(FORCED_TOOL_MODEL, sumOf(all.flatMap((r) => r.usages))))} at list price.`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
const naturalFails = SETS.fixable.filter((id) => data.natural[id].firstErrors.length > 0).length;
console.log("\nExpectations going in, against this run:");
console.log(`  Fixable documents fail and recover after 1-2 retries, naturally   ${yesNo(naturalFails === 2)} (${naturalFails} of 2 failed on their own)`);
console.log(`  Seeded failures recover after 1-2 retries                         ${yesNo(SETS.fixable.every((id) => data.seeded[id].status === "clean" && data.seeded[id].retries <= 2))}`);
console.log(`  Absent-information documents go to a person with no retry         ${yesNo(SETS.absent.every((id) => data.natural[id].status === "human_review" && data.natural[id].retries === 0))}`);

const message = showRetry.message;
check("Step 3: a retry message has the document, the failed extraction and the error", message.includes("Original document:") && message.includes("GP-7741") && message.includes("Your extraction:") && message.includes("sum to 1577.6"));
for (const id of SETS.fixable) {
  const r = data.seeded[id];
  check(`${id}: seeded failure was really invalid`, r.firstErrors.some((e) => e.code === "sum_mismatch"));
  check(`${id}: a real retry fixed it`, r.status === "clean" && r.retries >= 1, `${r.retries} retries`);
  check(`${id}: the final figures are the code's`, r.result.total_discrepancy === false);
  check(`${id}: the result matches the key's total`, Math.abs(lineItemSum(r.result.line_items) - getDocument(id).fields.total_amount) < 0.01);
}
for (const id of SETS.absent) {
  const r = data.natural[id];
  check(`${id}: routed to a person`, r.status === "human_review");
  check(`${id}: every remaining reason is unfixable`, r.errors.length > 0 && r.errors.every((e) => !e.fixable));
}
const d16 = data.natural.d16;
check("d16: the wrong total reaches a person", d16.status === "human_review" && d16.errors.some((e) => e.code === "source_conflict"), d16.errors.map((e) => e.code).join(", "));
check("d16: no invented line closed the gap", lineItemSum(d16.result.line_items) === 335, `sum ${lineItemSum(d16.result.line_items)}`);
check("d17: the wrong date order reaches a person, with no retry spent on it", data.natural.d17.status === "human_review" && data.natural.d17.errors.some((e) => e.code === "source_conflict"));
check("The loop never exceeds its cap", all.every((r) => r.retries <= 3));
finishChecks();
