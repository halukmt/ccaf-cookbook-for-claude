// The new date library. formatDate needs an explicit pattern, plusDays returns a new Date, and daysBetween(from, to) is to minus from.
export const formatDate = (date, pattern) => {
  if (pattern !== "yyyy-MM-dd") throw new Error("Unsupported pattern");
  return date.toISOString().slice(0, 10);
};
export const plusDays = (date, days) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
export const daysBetween = (from, to) => Math.round((to - from) / 86400000);
