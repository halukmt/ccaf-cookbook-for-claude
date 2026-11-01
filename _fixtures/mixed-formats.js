// Records from three invented backends that disagree on how to write a date and a status, plus the
// results of an invented compliance check.

const CUSTOMERS = {
  "C-001": { customer_id: "C-001", created_at: 1710489600, status: 200 },
  "C-002": { customer_id: "C-002", created_at: 1704067200, status: 404 },
};
const ORDERS = {
  "ORD-42": { order_id: "ORD-42", created_at: "2024-03-15T12:00:00Z", status: "active" },
};
const SHIPMENTS = {
  "SHP-7": { shipment_id: "SHP-7", created_at: "15/03/2024", status: "S" },
  "SHP-8": { shipment_id: "SHP-8", created_at: "02/04/2024", status: "P" },
};
// C-001 passes the anti-money-laundering check, C-002 fails it.
const AML_RESULTS = { "C-001": "pass", "C-002": "fail" };

const notFound = (key, id) => ({ [key]: id, error: "not_found" });

export const rawCustomer = (id) => CUSTOMERS[id] ?? notFound("customer_id", id);
export const rawOrder = (id) => ORDERS[id] ?? notFound("order_id", id);
export const rawShipment = (id) => SHIPMENTS[id] ?? notFound("shipment_id", id);
export const rawAmlResult = (id) => ({ customer_id: id, status: AML_RESULTS[id] ?? "fail" });
