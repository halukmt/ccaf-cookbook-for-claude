// Documented list prices, in USD per million tokens, as cached in the Claude API reference on
// 2026-10-06. The API reports tokens and never money, so anything computed here is an estimate from
// real token counts and documented prices. It is not a billed amount.

export const PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export const BATCH_DISCOUNT = 0.5; // Documented: batches cost 50% of standard prices.

export function addUsage(total, usage) {
  total.input_tokens = (total.input_tokens ?? 0) + (usage?.input_tokens ?? 0);
  total.output_tokens = (total.output_tokens ?? 0) + (usage?.output_tokens ?? 0);
  return total;
}

export function estimateCost(model, usage, { batch = false } = {}) {
  const price = PRICES[model];
  if (!price) throw new Error(`No documented price recorded for ${model}`);
  const full = ((usage.input_tokens ?? 0) * price.input + (usage.output_tokens ?? 0) * price.output) / 1e6;
  return batch ? full * BATCH_DISCOUNT : full;
}

export const usd = (value) => `$${value.toFixed(4)}`;
