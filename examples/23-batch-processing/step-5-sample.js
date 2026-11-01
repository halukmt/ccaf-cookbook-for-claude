// Step 5, first half: a real batch of the five sample documents for one prompt version.
// Usage: node step-5-sample.js v1 [--wait-minutes=9]
// Re-running with the same version resumes the same batch and never submits a second one.

import { check, finishChecks } from "../../_shared/check.js";
import { client } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { buildRequests, collect, failedIds, readResults, scoreByCustomId, store, submitOnce, usageOf, waitForEnd } from "./batch.js";
import { PROMPTS, SAMPLE_IDS } from "./prompts.js";

const version = process.argv[2];
if (!PROMPTS[version]) throw new Error(`Unknown prompt version: ${version}`);
const waitArg = process.argv.find((a) => a.startsWith("--wait-minutes="));
const maxMinutes = waitArg ? Number(waitArg.split("=")[1]) : 15;

const name = `sample-${version}`;
const requests = buildRequests(SAMPLE_IDS, PROMPTS[version]);
const record = await submitOnce(`${name}-batch`, async () => ({ batch: await client.messages.batches.create({ requests }), prompt: version }));
console.log(`Batch ${record.id}, submitted ${record.submittedAt}`);

const batch = await waitForEnd(record.id, { maxMinutes, onPoll: (b) => console.log(`  ${new Date().toISOString()} ${b.processing_status} ${JSON.stringify(b.request_counts)}`) });
if (batch.processing_status !== "ended") {
  console.log(`Not ended after ${maxMinutes} minutes. Run this command again to resume, or: node collect-batch.js ${name}-batch`);
  process.exit(2);
}

const entries = await collect(record.id);
const byId = readResults(entries);
const score = scoreByCustomId(byId);
const usage = usageOf(byId);
store.save(name, {
  batchId: record.id, prompt: PROMPTS[version], version,
  submittedAt: record.submittedAt, endedAt: batch.ended_at, createdAt: batch.created_at,
  receivedOrder: entries.map((e) => e.custom_id), requestOrder: requests.map((r) => r.custom_id),
  byId, accuracy: score.accuracy, tally: score.tally, docsRight: score.docsRight, docs: score.docs, wrongFields: score.wrongFields, usage,
});

const seconds = Math.round((new Date(batch.ended_at) - new Date(batch.created_at)) / 1000);
console.log(`Ended in ${seconds} s by the API's timestamps. Accuracy ${(score.accuracy * 100).toFixed(0)}% of ${score.tally.fields} fields. Documents fully right: ${score.docsRight} of ${score.docs}.`);
console.table(score.wrongFields);
console.log(`Received order differs from request order: ${entries.map((e) => e.custom_id).join() !== requests.map((r) => r.custom_id).join()}`);
console.log(`${usage.input_tokens} in, ${usage.output_tokens} out. Batch price ${usd(estimateCost(entries[0].result.message.model, usage, { batch: true }))}, computed.`);

check("Five results came back", entries.length === 5);
check("Every custom_id we sent came back", requests.every((r) => byId[r.custom_id]));
check("All five are usable", failedIds(byId).length === 0, failedIds(byId).join(", "));
check("Results hold real data", score.tally.correct > 0);
finishChecks();
