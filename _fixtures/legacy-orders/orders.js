export async function processOrder(orderId, { validate = false } = {}) {
  if (validate && !orderId) throw new Error("orderId is required");
  return { id: orderId, status: "processed", via: "new", validated: validate };
}
