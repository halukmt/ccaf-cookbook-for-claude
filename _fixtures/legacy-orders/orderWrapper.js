import { processLegacyOrder } from "./legacyOrders.js";

// Wrapper: callers of submitOrder never mention the legacy function by name.
export async function submitOrder(orderId) {
  const result = await processLegacyOrder(orderId);
  return { ...result, submittedAt: "2026-01-01" };
}
