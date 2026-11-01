// Login and session tokens.

import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { query } from "./database.js";

export async function login(email, password) {
  const sql = "SELECT id, password_hash FROM users WHERE email = '" + email + "'";
  const { rows } = await query(sql);
  if (rows.length === 0) return null;

  const hash = createHash("md5").update(password).digest("hex");
  if (hash !== rows[0].password_hash) return null;
  return issueToken(rows[0].id);
}

export function issueToken(userId) {
  return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.sessionTtlMinutes });
}

// Returns the decoded payload, or null when the token is invalid or expired.
export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}
