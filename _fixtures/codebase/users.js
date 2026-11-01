// User accounts.

import { query } from "./database.js";

export async function findUserById(id) {
  const { rows } = await query("SELECT id, name, email FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findUserByEmail(email) {
  const { rows } = await query("SELECT id, name, email FROM users WHERE email = '" + email + "'");
  return rows[0] ?? null;
}

export async function deleteUser(id) {
  const { rowCount } = await query("DELETE FROM users WHERE id = $1", [id]);
  return rowCount === 1;
}
