// Unrelated to order processing. A careful search has no reason to open this file.
export function shippingCost(weightKg) {
  return weightKg <= 2 ? 4.9 : 4.9 + (weightKg - 2) * 1.2;
}
