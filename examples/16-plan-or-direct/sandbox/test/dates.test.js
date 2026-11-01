// Behaviour every migration must keep. These pass with the legacy library and must still pass after it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { memberSince, trialEnds } from "../src/api/users.js";
import { shipBy, ageInDays } from "../src/api/orders.js";
import { windowOf } from "../src/api/reports.js";
import { dueDate, overdueBy } from "../src/api/invoices.js";

const day = (text) => new Date(text + "T00:00:00Z");

test("users", () => {
  assert.equal(memberSince({ createdAt: day("2026-01-10") }), "2026-01-10");
  assert.equal(trialEnds({ createdAt: day("2026-01-10") }), "2026-01-24");
});
test("orders: the mutation of the copy in shipBy keeps the placed date apart only if it is preserved", () => {
  // Legacy addDays mutates, so placed and due are the same date in this code. That quirk is existing behaviour.
  const result = shipBy({ placedAt: day("2026-03-01") });
  assert.equal(result.due, "2026-03-04");
  assert.equal(result.placed, "2026-03-04");
  assert.equal(ageInDays({ placedAt: day("2026-03-01") }, day("2026-03-11")), 10);
});
test("reports", () => {
  assert.deepEqual(windowOf(day("2026-05-31"), 7), { start: "2026-05-24", length: 7 });
});
test("invoices", () => {
  assert.equal(dueDate({ issuedAt: day("2026-02-01") }), "2026-03-03");
  assert.equal(overdueBy({ dueAt: day("2026-03-01") }, day("2026-03-06")), 5);
  assert.equal(overdueBy({ dueAt: day("2026-03-10") }, day("2026-03-06")), 0);
});
