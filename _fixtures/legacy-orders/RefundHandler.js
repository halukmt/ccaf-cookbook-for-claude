import { processLegacyOrder } from "./index.js";

export async function handleRefund(orderId) {
  const result = await processLegacyOrder(orderId);
  return { ...result, refund: "full" };
}

export async function handlePartialRefund(orderId) {
  const result = await processLegacyOrder(orderId);
  return { ...result, refund: "partial" };
}

export async function handleChargeback(orderId) {
  const result = await processLegacyOrder(orderId);
  return { ...result, refund: "chargeback" };
}
