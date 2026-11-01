// invoices handlers. Marker: API-INVOICES-4404
import * as legacy from "../../vendor/legacy-date.js";
import { currentUser } from "../auth/index.js";

export function dueDate(invoice) {
  return legacy.format(legacy.addDays(new Date(invoice.issuedAt), 30));
}

export function overdueBy(invoice, today) {
  return Math.max(0, legacy.diffDays(today, invoice.dueAt));
}

export function invoicesHandler1(request) {
  // Handler 1: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 1 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 1, user } };
}

export function invoicesHandler2(request) {
  // Handler 2: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 2 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 2, user } };
}

export function invoicesHandler3(request) {
  // Handler 3: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 3 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 3, user } };
}

export function invoicesHandler4(request) {
  // Handler 4: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 4 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 4, user } };
}

export function invoicesHandler5(request) {
  // Handler 5: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 5 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 5, user } };
}

export function invoicesHandler6(request) {
  // Handler 6: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 6 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 6, user } };
}

export function invoicesHandler7(request) {
  // Handler 7: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 7 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 7, user } };
}

export function invoicesHandler8(request) {
  // Handler 8: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 8 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 8, user } };
}

export function invoicesHandler9(request) {
  // Handler 9: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 9 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 9, user } };
}

export function invoicesHandler10(request) {
  // Handler 10: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 10 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 10, user } };
}

export function invoicesHandler11(request) {
  // Handler 11: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 11 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 11, user } };
}

export function invoicesHandler12(request) {
  // Handler 12: checks the session and returns one invoices view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "invoices 12 needs a session" };
  return { status: 200, data: { kind: "invoices", variant: 12, user } };
}

