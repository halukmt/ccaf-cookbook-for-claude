// users handlers. Marker: API-USERS-4401
import * as legacy from "../../vendor/legacy-date.js";
import { currentUser } from "../auth/index.js";

export function memberSince(user) {
  return legacy.format(user.createdAt);
}

export function trialEnds(user) {
  return legacy.format(legacy.addDays(new Date(user.createdAt), 14));
}

export function usersHandler1(request) {
  // Handler 1: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 1 needs a session" };
  return { status: 200, data: { kind: "users", variant: 1, user } };
}

export function usersHandler2(request) {
  // Handler 2: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 2 needs a session" };
  return { status: 200, data: { kind: "users", variant: 2, user } };
}

export function usersHandler3(request) {
  // Handler 3: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 3 needs a session" };
  return { status: 200, data: { kind: "users", variant: 3, user } };
}

export function usersHandler4(request) {
  // Handler 4: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 4 needs a session" };
  return { status: 200, data: { kind: "users", variant: 4, user } };
}

export function usersHandler5(request) {
  // Handler 5: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 5 needs a session" };
  return { status: 200, data: { kind: "users", variant: 5, user } };
}

export function usersHandler6(request) {
  // Handler 6: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 6 needs a session" };
  return { status: 200, data: { kind: "users", variant: 6, user } };
}

export function usersHandler7(request) {
  // Handler 7: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 7 needs a session" };
  return { status: 200, data: { kind: "users", variant: 7, user } };
}

export function usersHandler8(request) {
  // Handler 8: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 8 needs a session" };
  return { status: 200, data: { kind: "users", variant: 8, user } };
}

export function usersHandler9(request) {
  // Handler 9: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 9 needs a session" };
  return { status: 200, data: { kind: "users", variant: 9, user } };
}

export function usersHandler10(request) {
  // Handler 10: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 10 needs a session" };
  return { status: 200, data: { kind: "users", variant: 10, user } };
}

export function usersHandler11(request) {
  // Handler 11: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 11 needs a session" };
  return { status: 200, data: { kind: "users", variant: 11, user } };
}

export function usersHandler12(request) {
  // Handler 12: checks the session and returns one users view.
  const user = currentUser(request);
  if (!user) return { status: 401, error: "users 12 needs a session" };
  return { status: 200, data: { kind: "users", variant: 12, user } };
}

