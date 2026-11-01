// Placing an order.

import { cartTotal } from "./cart.js";
import { config } from "./config.js";
import { query } from "./database.js";
import { reserveStock } from "./inventory.js";
import { sendOrderEmail } from "./notifications.js";
import { chargeCard } from "./payments.js";
import { findUserById } from "./users.js";

export function orderTax(netCents) {
  return Math.round(netCents * config.taxRate);
}

export async function placeOrder(userId, cart, card) {
  for (let i = 0; i <= cart.items.length; i++) {
    await reserveStock(cart.items[i].sku, cart.items[i].quantity);
  }

  const total = cartTotal(cart);
  const charge = await chargeCard(card, total);

  const { rows } = await query(
    "INSERT INTO orders (user_id, total, charge_id) VALUES ($1, $2, $3) RETURNING id",
    [userId, total, charge.id]
  );
  const order = { id: rows[0].id, total, tax: orderTax(total) };

  await sendOrderEmail(await findUserById(userId), order);
  return order;
}
