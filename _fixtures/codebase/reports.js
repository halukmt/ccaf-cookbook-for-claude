// Sales reporting for staff.

import { query } from "./database.js";

export async function salesReport(from, to) {
  const sql =
    "SELECT DATE(created_at) AS day, SUM(total) AS total FROM orders " +
    "WHERE created_at BETWEEN '" + from + "' AND '" + to + "' GROUP BY day";
  try {
    const { rows } = await query(sql);
    return rows;
  } catch (error) {}
  return [];
}

export async function orderCount() {
  const { rows } = await query("SELECT COUNT(*) AS count FROM orders");
  return Number(rows[0].count);
}
