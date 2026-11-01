// Step 5, second half: all 20 documents as a real batch, using the refined prompt, with two requests
// made to fail on purpose. Then a retry batch of only the failures.
// Usage: node step-5-full.js [--wait-minutes=9]. Re-running resumes the saved batches.

import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL, MODEL, client } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { DOCUMENTS, getDocument } from "../../_fixtures/documents-answers.js";
import { buildRetryRequests, buildRequests, collect, customId, docIdOf, failedIds, readResults, scoreByCustomId, store, submitOnce, usageOf, waitForEnd } from "./batch.js";
import { PROMPTS, SAMPLE_IDS } from "./prompts.js";

const PROMPT = PROMPTS.v2;
const IDS = DOCUMENTS.map((d) => d.id);
const TRUNCATE = "d05"; // Succeeds, yet is cut off: max_tokens is far too small.
const ERROR = "d02"; // Sonnet 5.5 rejects forced tool_choice.

const waitArg = process.argv.find((a) => a.startsWith("--wait-minutes="));
const maxMinutes = waitArg ? Number(waitArg.split("=")[1]) : 15;
const onPoll = (b) => console.log(`  ${new Date().toISOString()} ${b.processing_status} ${JSON.stringify(b.request_counts)}`);

const requests = buildRequests(IDS, PROMPT);
const at = (id) => requests.findIndex((r) => r.custom_id === customId(getDocument(id), IDS.indexOf(id)));
requests[at(TRUNCATE)].params.max_tokens = 30;

// Two ways of making one request fail, tried in order. A rejected create() costs nothing and is recorded.
const FAILURE_CANDIDATES = [
  { name: "forced tool_choice on Sonnet 5.5", apply: (params) => ({ ...params, model: MODEL }) },
  { name: "a model that does not exist", apply: (params) => ({ ...params, model: "claude-does-not-exist" }) },
];

const record = await submitOnce("full-batch", async () => {
  const rejected = [];
  const original = requests[at(ERROR)].params;
  for (const candidate of FAILURE_CANDIDATES) {
    requests[at(ERROR)].params = candidate.apply(original);
    try {
      const batch = await client.messages.batches.create({ requests });
      return { batch, failingRequest: candidate.name, rejectedAtCreate: rejected, requests };
    } catch (error) {
      if (error.status !== 400) throw error;
      rejected.push({ candidate: candidate.name, status: error.status, message: error.error?.error?.message ?? error.message });
      console.log(`create() rejected the whole batch for: ${candidate.name}`);
    }
  }
  requests[at(ERROR)].params = original;
  return { batch: await client.messages.batches.create({ requests }), failingRequest: null, rejectedAtCreate: rejected, requests };
});
console.log(`Batch ${record.id}. Failing request: ${record.failingRequest ?? "none accepted"}. Rejected at create: ${record.rejectedAtCreate.length}.`);

const batch = await waitForEnd(record.id, { maxMinutes, onPoll });
if (batch.processing_status !== "ended") {
  store.save("full-pending", { id: record.id, checkedAt: new Date().toISOString(), counts: batch.request_counts });
  console.log(`Not ended after ${maxMinutes} minutes. Run this again to resume, or: node collect-batch.js full-batch`);
  process.exit(2);
}

const entries = await collect(record.id);
const byId = readResults(entries);
const failed = failedIds(byId);
console.log(`Ended ${batch.ended_at}. Counts ${JSON.stringify(batch.request_counts)}.`);
console.table(failed.map((id) => ({ id, failure: byId[id].failure, detail: byId[id].detail })));

// Retry only what failed, keyed by custom_id.
const retryRequests = buildRetryRequests(byId, record.requests);
const retryRecord = await submitOnce("retry-batch", async () => ({ batch: await client.messages.batches.create({ requests: retryRequests }), requests: retryRequests }));
console.log(`Retry batch ${retryRecord.id} holds ${retryRecord.requests.length} of ${requests.length} documents.`);
const retryBatch = await waitForEnd(retryRecord.id, { maxMinutes, onPoll });
if (retryBatch.processing_status !== "ended") {
  store.save("retry-pending", { id: retryRecord.id, checkedAt: new Date().toISOString(), counts: retryBatch.request_counts });
  console.log(`Retry not ended after ${maxMinutes} minutes. Run this again to resume, or: node collect-batch.js retry-batch`);
  process.exit(2);
}
const retryById = readResults(await collect(retryRecord.id));

// The merged result: originals that worked plus retries that worked.
const merged = { ...Object.fromEntries(Object.entries(byId).filter(([, row]) => row.usable)), ...retryById };
const firstPass = scoreByCustomId(Object.fromEntries(Object.entries(byId).filter(([id]) => !failed.includes(id))));
const finalScore = scoreByCustomId(merged);
const unseen = Object.fromEntries(Object.entries(byId).filter(([id, row]) => row.usable && !SAMPLE_IDS.includes(docIdOf(id))));
const unseenScore = scoreByCustomId(unseen);
const usage = usageOf(byId);
const retryUsage = usageOf(retryById);
const modelCost = estimateCost(FAST_MODEL, usage, { batch: true }) + estimateCost(FAST_MODEL, retryUsage, { batch: true });

store.save("full", {
  batchId: record.id, retryBatchId: retryRecord.id, failingRequest: record.failingRequest, rejectedAtCreate: record.rejectedAtCreate,
  createdAt: batch.created_at, endedAt: batch.ended_at, retryCreatedAt: retryBatch.created_at, retryEndedAt: retryBatch.ended_at,
  counts: batch.request_counts, retryCounts: retryBatch.request_counts,
  receivedOrder: entries.map((e) => e.custom_id), requestOrder: record.requests.map((r) => r.custom_id),
  failed: failed.map((id) => ({ id, failure: byId[id].failure, detail: byId[id].detail })),
  byId, retryById, firstPass: { accuracy: firstPass.accuracy, tally: firstPass.tally, docsRight: firstPass.docsRight, docs: firstPass.docs, wrongFields: firstPass.wrongFields },
  unseen: { accuracy: unseenScore.accuracy, tally: unseenScore.tally, docsRight: unseenScore.docsRight, docs: unseenScore.docs, wrongFields: unseenScore.wrongFields },
  final: { accuracy: finalScore.accuracy, tally: finalScore.tally, docsRight: finalScore.docsRight, docs: finalScore.docs, wrongFields: finalScore.wrongFields },
  usage, retryUsage,
});

const pct = (v) => `${(v * 100).toFixed(0)}%`;
console.log(`First pass, usable requests: ${pct(firstPass.accuracy)} of ${firstPass.tally.fields} fields, ${firstPass.docsRight} of ${firstPass.docs} documents fully right.`);
console.log(`The ${unseenScore.docs} documents outside the sample: ${pct(unseenScore.accuracy)} of ${unseenScore.tally.fields} fields, ${unseenScore.docsRight} fully right.`);
console.log(`After retries, all documents: ${pct(finalScore.accuracy)} of ${finalScore.tally.fields} fields, ${finalScore.docsRight} of ${finalScore.docs} documents.`);
console.table(finalScore.wrongFields);
console.log(`Order differs from request: ${entries.map((e) => e.custom_id).join() !== record.requests.map((r) => r.custom_id).join()}. Batch price, computed from tokens: ${usd(modelCost)}.`);

check("Twenty results came back", entries.length === 20);
check("Every custom_id came back exactly once", new Set(entries.map((e) => e.custom_id)).size === 20 && record.requests.every((r) => byId[r.custom_id]));
check("The truncated request was detected", byId[customId(getDocument(TRUNCATE), IDS.indexOf(TRUNCATE))].failure === "truncated");
check("A deliberately invalid request failed, if the API accepted one into the batch", !record.failingRequest || byId[customId(getDocument(ERROR), IDS.indexOf(ERROR))].failure === "errored", record.failingRequest ?? "rejected at create");
check("The retry batch held only failures", retryRecord.requests.length === failed.length && failed.length < 20);
check("Every retried document now has a usable result", Object.values(retryById).every((row) => row.usable));
check("All twenty documents have a usable final result", finalScore.docs === 20);
check("Scores hold real data", finalScore.tally.correct > 0);
finishChecks();
