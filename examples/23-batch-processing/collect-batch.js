// Finishes a saved batch without submitting anything: checks the status once, and if it has ended,
// prints its results by custom_id and saves them. Retrieving costs nothing.
// Usage: node collect-batch.js sample-v1-batch

import { client } from "../../_shared/client.js";
import { collect, failedIds, readResults, scoreByCustomId, store } from "./batch.js";

const name = process.argv[2];
if (!name) throw new Error("Give the saved batch name, for example full-batch");
const { id } = store.load(name);

const batch = await client.messages.batches.retrieve(id);
console.log(`${id}: ${batch.processing_status} ${JSON.stringify(batch.request_counts)}`);
if (batch.processing_status !== "ended") {
  console.log("Still pending. Nothing is written. Run this again later; results are not available yet.");
  process.exit(2);
}

const byId = readResults(await collect(id));
const score = scoreByCustomId(byId);
store.save(`${name}-collected`, { id, endedAt: batch.ended_at, counts: batch.request_counts, byId, wrongFields: score.wrongFields, accuracy: score.accuracy });
console.log(`Saved results/${name}-collected.json. Usable ${score.docs}, failed ${failedIds(byId).length}, accuracy ${(score.accuracy * 100).toFixed(0)}% of ${score.tally.fields} fields.`);
