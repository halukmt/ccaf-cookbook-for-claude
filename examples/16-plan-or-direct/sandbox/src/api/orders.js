// orders handlers. Marker: API-ORDERS-4402
import * as legacy from "../../vendor/legacy-date.js";
import { currentUser } from "../auth/index.js";

export function shipBy(order) {
  const placed = new Date(order.placedAt);
  const due = legacy.addDays(placed, 3);
  return { placed: legacy.format(placed), due: legacy.format(due) };
}

export function ageInDays(order, today) {
  return legacy.diffDays(today, order.placedAt);
}

export function ordersHandler1(request) {
  // Handler 1: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 1 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 1, user } };
}

export function ordersHandler2(request) {
  // Handler 2: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 2 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 2, user } };
}

export function ordersHandler3(request) {
  // Handler 3: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 3 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 3, user } };
}

export function ordersHandler4(request) {
  // Handler 4: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 4 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 4, user } };
}

export function ordersHandler5(request) {
  // Handler 5: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 5 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 5, user } };
}

export function ordersHandler6(request) {
  // Handler 6: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 6 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 6, user } };
}

export function ordersHandler7(request) {
  // Handler 7: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 7 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 7, user } };
}

export function ordersHandler8(request) {
  // Handler 8: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 8 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 8, user } };
}

export function ordersHandler9(request) {
  // Handler 9: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 9 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 9, user } };
}

export function ordersHandler10(request) {
  // Handler 10: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 10 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 10, user } };
}

export function ordersHandler11(request) {
  // Handler 11: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 11 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 11, user } };
}

export function ordersHandler12(request) {
  // Handler 12: checks the session and returns one orders view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "orders 12 needs a session" };
  return { status: 200, data: { kind: "orders", variant: 12, user } };
}

