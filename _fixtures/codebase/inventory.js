// Stock levels and reservations.

import { query } from "./database.js";

export async function stockLevel(sku) {
  const [row] = await query("SELECT quantity FROM stock WHERE sku = $1", [sku]);
  return row ? row.quantity : 0;
}

export async function reserveStock(sku, quantity) {
  const available = await stockLevel(sku);
  if (available < quantity) {
    throw new Error(`Not enough stock for ${sku}`);
  }
  query("UPDATE stock SET quantity = quantity - $1 WHERE sku = $2", [quantity, sku]);
  return { sku, reserved: quantity };
}
