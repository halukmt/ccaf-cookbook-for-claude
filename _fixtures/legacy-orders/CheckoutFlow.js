import { submitOrder } from "./orderWrapper.js";

export async function checkout(orderId) {
  const order = await submitOrder(orderId);
  return { ...order, step: "confirmed" };
}
