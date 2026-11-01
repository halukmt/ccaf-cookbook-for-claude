// The discount and the latency, from what really ran. The same five requests go through the standard
// API once, to compare tokens and time. Token counts are real. Prices are documented, never reported
// by the API, so every dollar figure here is computed. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL, client } from "../../_shared/client.js";
import { BATCH_DISCOUNT, PRICES, addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { buildRequests, store } from "./batch.js";
import { PROMPTS, SAMPLE_IDS } from "./prompts.js";

const sample = store.load("sample-v2");
const sync = await store.runOnce("sync-comparison", async () => {
  const rows = [];
  for (const { custom_id: id, params } of buildRequests(SAMPLE_IDS, PROMPTS.v2)) {
    const started = Date.now();
    const message = await client.messages.create(params);
    rows.push({ id, ms: Date.now() - started, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }, serviceTier: message.usage.service_tier ?? null });
  }
  return rows;
});

const syncUsage = sync.reduce((total, row) => addUsage(total, row.usage), { input_tokens: 0, output_tokens: 0 });
const batchSeconds = (new Date(sample.endedAt) - new Date(sample.createdAt)) / 1000;
const syncSeconds = sync.reduce((sum, row) => sum + row.ms, 0) / 1000;

const syncCost = estimateCost(FAST_MODEL, syncUsage);
const batchCostAtBatchPrice = estimateCost(FAST_MODEL, sample.usage, { batch: true });
const batchTokensAtList = estimateCost(FAST_MODEL, sample.usage);
const tiers = [...new Set(Object.values(sample.byId).map((row) => row.usage?.service_tier))];

console.log("REAL, from API responses:");
console.table([
  { run: "batch, 5 documents", input: sample.usage.input_tokens, output: sample.usage.output_tokens, seconds: batchSeconds },
  { run: "standard, same 5, one after another", input: syncUsage.input_tokens, output: syncUsage.output_tokens, seconds: Math.round(syncSeconds) },
]);
console.log(`service_tier reported on batch results: ${tiers.join(", ")}; on standard calls: ${[...new Set(sync.map((r) => r.serviceTier))].join(", ")}`);
console.log(`DOCUMENTED: ${FAST_MODEL} at $${PRICES[FAST_MODEL].input} / $${PRICES[FAST_MODEL].output} per million tokens, batch at ${BATCH_DISCOUNT * 100}%.`);
console.log("COMPUTED from those two, not billed figures:");
console.log(`  Standard calls:              ${usd(syncCost)}`);
console.log(`  Batch tokens at list price:  ${usd(batchTokensAtList)}`);
console.log(`  Batch tokens at batch price: ${usd(batchCostAtBatchPrice)}`);
console.log(`  Saving against the standard calls, same tokens or not: ${((1 - batchCostAtBatchPrice / syncCost) * 100).toFixed(0)}%`);
console.log("NOT VERIFIED: the 50% itself. The API returns no money, and this account's invoice was not read.");
store.save("discount", { syncUsage, batchUsage: sample.usage, batchSeconds, syncSeconds, syncCost, batchCostAtBatchPrice, batchTokensAtList, tiers, syncTiers: [...new Set(sync.map((r) => r.serviceTier))] });

check("All five standard calls ran", sync.length === 5);
check("Token counts are real", syncUsage.input_tokens > 0 && sample.usage.input_tokens > 0);
check("Input tokens match between the two, as the same requests were sent", Math.abs(syncUsage.input_tokens - sample.usage.input_tokens) <= 5, `${sample.usage.input_tokens} vs ${syncUsage.input_tokens}`);
check("The batch was slower than the calls here, which is the trade", batchSeconds > syncSeconds, `${batchSeconds} s vs ${Math.round(syncSeconds)} s`);
check("The arithmetic is right: 1M tokens each way", Math.abs(estimateCost(FAST_MODEL, { input_tokens: 1e6, output_tokens: 1e6 }, { batch: true }) - 0.3) < 1e-9);
finishChecks();
