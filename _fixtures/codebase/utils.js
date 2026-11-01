// Small helpers.

// formatCurrency(1999, "EUR") returns "19.99 EUR". The amount is integer cents.
export function formatCurrency(amountCents, currency) {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

// Returns one page of a list. Pages start at 1.
export function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize - 1);
}

export function isEmail(value) {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}
