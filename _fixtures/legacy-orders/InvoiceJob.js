import { processLegacyOrder } from "./index.js";

export async function invoiceOne(orderId) {
  const order = await processLegacyOrder(orderId);
  return { ...order, invoice: "single" };
}

export async function invoiceAgain(orderId) {
  const order = await processLegacyOrder(orderId);
  return { ...order, invoice: "repeat" };
}
