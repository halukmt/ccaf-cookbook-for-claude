// Unrelated to order processing. A careful search has no reason to open this file.
export function vat(amount, rate = 0.19) {
  return Math.round(amount * rate * 100) / 100;
}
