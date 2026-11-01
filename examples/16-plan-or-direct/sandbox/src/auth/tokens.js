// Token helpers. Imported by session.js and by the API handlers.
import { createHmac } from "node:crypto";
const SECRET = process.env.AUTH_SECRET ?? "dev-only";
export const signToken = (userId) => userId + "." + createHmac("sha256", SECRET).update(userId).digest("hex");
export const verifyToken = (token) => {
  const [userId] = String(token).split(".");
  return signToken(userId) === token ? userId : null;
};
