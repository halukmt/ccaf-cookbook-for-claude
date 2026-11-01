// The shopping cart. All prices are integer cents.

import { config } from "./config.js";

export function createCart() {
  return { items: [] };
}

export function addItem(cart, item) {
  if (cart.items.length >= config.maxCartItems) {
    throw new Error("Cart is full");
  }
  const existing = cart.items.find((line) => line.sku === item.sku);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.items.push({ ...item });
  }
  return cart;
}

// Returns the cart total in integer cents.
export function cartTotal(cart) {
  return cart.items.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}
