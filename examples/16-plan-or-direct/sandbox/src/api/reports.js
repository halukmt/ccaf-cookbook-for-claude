// reports handlers. Marker: API-REPORTS-4403
import * as legacy from "../../vendor/legacy-date.js";
import { currentUser } from "../auth/index.js";

export function windowOf(end, days) {
  const start = legacy.addDays(new Date(end), -days);
  return { start: legacy.format(start), length: legacy.diffDays(end, start) };
}

export function reportsHandler1(request) {
  // Handler 1: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 1 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 1, user } };
}

export function reportsHandler2(request) {
  // Handler 2: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 2 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 2, user } };
}

export function reportsHandler3(request) {
  // Handler 3: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 3 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 3, user } };
}

export function reportsHandler4(request) {
  // Handler 4: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 4 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 4, user } };
}

export function reportsHandler5(request) {
  // Handler 5: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 5 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 5, user } };
}

export function reportsHandler6(request) {
  // Handler 6: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 6 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 6, user } };
}

export function reportsHandler7(request) {
  // Handler 7: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 7 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 7, user } };
}

export function reportsHandler8(request) {
  // Handler 8: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 8 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 8, user } };
}

export function reportsHandler9(request) {
  // Handler 9: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 9 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 9, user } };
}

export function reportsHandler10(request) {
  // Handler 10: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 10 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 10, user } };
}

export function reportsHandler11(request) {
  // Handler 11: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 11 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 11, user } };
}

export function reportsHandler12(request) {
  // Handler 12: checks the session and returns one reports view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "reports 12 needs a session" };
  return { status: 200, data: { kind: "reports", variant: 12, user } };
}

