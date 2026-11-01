// The old date library. format has a default pattern, addDays mutates its argument, and diffDays(a, b) is a minus b.
export const format = (date, pattern = "YYYY-MM-DD") => {
  if (pattern !== "YYYY-MM-DD") throw new Error("Unsupported pattern");
  return date.toISOString().slice(0, 10);
};
export const addDays = (date, days) => {
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
export const diffDays = (a, b) => Math.round((a - b) / 86400000);
