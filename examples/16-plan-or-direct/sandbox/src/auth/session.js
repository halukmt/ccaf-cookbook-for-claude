// Session lookups. Uses tokens.js and an in-process map, which is what makes extracting this module a real decision.
import { verifyToken } from "./tokens.js";
const sessions = new Map();
export const openSession = (token) => {
  const userId = verifyToken(token);
  if (!userId) return null;
  sessions.set(token, { userId, openedAt: Date.now() });
  return sessions.get(token);
};
export const currentUser = (request) => sessions.get(request.headers?.authorization)?.userId ?? null;
