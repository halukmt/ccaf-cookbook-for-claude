// @deprecated Use processOrder from ./orders.js.
export async function processLegacyOrder(orderId) {
  return { id: orderId, status: "processed", via: "legacy" };
}
