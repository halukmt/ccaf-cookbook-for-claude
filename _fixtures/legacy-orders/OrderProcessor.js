import { processLegacyOrder } from "./legacyOrders.js";

export async function processIncoming(orderId) {
  const order = await processLegacyOrder(orderId);
  return { ...order, queue: "incoming" };
}
