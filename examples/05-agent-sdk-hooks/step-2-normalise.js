// The normaliser on its own, including inputs that a simple version gets wrong. No model.

import { check, finishChecks } from "../../_shared/check.js";
import { rawCustomer, rawOrder, rawShipment } from "../../_fixtures/mixed-formats.js";
import { normaliseDate, normaliseRecord, normaliseStatus } from "./hooks.js";

const a = normaliseRecord(rawCustomer("C-001"));
const b = normaliseRecord(rawOrder("ORD-42"));
const c = normaliseRecord(rawShipment("SHP-7"));
console.log({ a, b, c });

check("Epoch seconds become ISO 8601", a.created_at === "2024-03-15T08:00:00.000Z", a.created_at);
check("ISO input gets the same exact shape", b.created_at === "2024-03-15T12:00:00.000Z", b.created_at);
check("DD/MM/YYYY becomes ISO 8601", c.created_at === "2024-03-15T00:00:00.000Z", c.created_at);
check("200 becomes active", a.status === "active");
check("A word status passes through", b.status === "active");
check("S becomes shipped", c.status === "shipped");
check("P becomes pending", normaliseStatus("P") === "pending");
check("Other fields survive", a.customer_id === "C-001" && c.shipment_id === "SHP-7");

check("02/04/2024 is read as 2 April, not 4 February", normaliseDate("02/04/2024") === "2024-04-02T00:00:00.000Z");
check("An impossible day is refused, not rolled over", normaliseDate("31/02/2024") === null);
check("A US-style date is refused, not guessed", normaliseDate("03/13/2024") === null);
check("Free text is refused", normaliseDate("next Tuesday") === null);

const bad = normaliseRecord({ id: "X", created_at: "31/02/2024", status: 500 });
check(
  "A value nobody can read is flagged and keeps its raw form",
  bad.created_at === "unknown" && bad.status === "unknown" &&
    bad.normalisation_problems.some((p) => p.field === "created_at" && p.raw === "31/02/2024") &&
    bad.normalisation_problems.some((p) => p.field === "status" && p.raw === 500)
);
check("A record without these fields is left alone", !("status" in normaliseRecord({ id: 1 })));

finishChecks();
