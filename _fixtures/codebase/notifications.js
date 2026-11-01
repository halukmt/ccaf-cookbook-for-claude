// Customer email.

import { config } from "./config.js";
import { formatCurrency } from "./utils.js";
import { mailer } from "./mailer-stub.js";

export async function sendOrderEmail(user, order) {
  const html =
    `<p>Hello ${user.name},</p>` +
    `<p>Thank you for your order. Total: ${formatCurrency("EUR", order.total)}</p>`;

  try {
    await mailer.send({ from: config.mailFrom, to: user.email, subject: "Your order", html });
  } catch (error) {}
}
