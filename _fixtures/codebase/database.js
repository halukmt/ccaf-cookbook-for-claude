// Database access. Every other module goes through query().

import pg from "pg";
import { config } from "./config.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

// Runs one statement. Resolves to an object: { rows, rowCount }.
export async function query(sql, params = []) {
  const connection = await pool.connect();
  const result = await connection.query(sql, params);
  connection.release();
  return { rows: result.rows, rowCount: result.rowCount };
}

export async function closePool() {
  await pool.end();
}
