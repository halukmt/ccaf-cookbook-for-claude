// Adapter between the central server and the batch code.
// "saved" and "sla" cost nothing. "status" only reads a batch's status. "mini" submits a real two-document
// batch and may wait several minutes, so it is never the default.

import { client, FAST_MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { buildRequests, collect, failedIds, readResults, scoreByCustomId, store, usageOf, waitForEnd } from "./batch.js";
import { PROMPTS } from "./prompts.js";
import { WORKFLOWS, maxIntervalHours, worstCaseHours } from "./workflows.js";

const pct = (v) => `${(v * 100).toFixed(0)}%`;

function emitSaved(emit) {
  emit({ type: "section", title: "Who is waiting?", text: "If someone is blocked on the result, a batch is the wrong tool, whatever it saves." });
  for (const w of WORKFLOWS) emit({ type: "card", title: w.name, badge: w.type, tone: w.type === "batch" ? "good" : "tool", text: `${w.waiting}. ${w.reason}.` });

  emit({ type: "section", title: "Refining on the sample first", text: "Five documents as real batches." });
  for (const version of ["v1", "v2"]) {
    const s = store.load(`sample-${version}`);
    emit({ type: "card", title: `Prompt ${version}`, badge: `${s.docsRight} of ${s.docs} documents fully right`, tone: s.docsRight === s.docs ? "good" : "warn", text: `${s.prompt}\n\n${pct(s.accuracy)} of ${s.tally.fields} fields.`, data: s.wrongFields });
  }

  const full = store.load("full");
  emit({ type: "section", title: "Full batch", text: "Twenty documents, two of them made to fail on purpose. Results are read by custom_id." });
  emit({ type: "summary", items: [
    [`${full.counts.succeeded} / ${full.counts.errored}`, "succeeded / errored, as the API counts"],
    [full.failed.length, "really failed, including a cut-off reply"],
    [`${full.final.docsRight} of ${full.final.docs}`, "documents fully right after retry"],
    [`${pct(full.final.accuracy)} of ${full.final.tally.fields}`, "fields right"],
  ] });
  for (const f of full.failed) emit({ type: "card", title: f.id, badge: f.failure, tone: "warn", text: f.detail });
  emit({ type: "card", title: "Order received, against order sent", tone: "muted", text: `Sent:     ${full.requestOrder.slice(0, 6).join(", ")} ...\nReceived: ${full.receivedOrder.slice(0, 6).join(", ")} ...` });

  const d = store.load("discount");
  emit({ type: "section", title: "The discount", text: "Tokens and seconds are real. Dollars are computed from documented prices and were not read from a bill." });
  emit({ type: "summary", items: [
    [`${Math.round(d.syncSeconds)} s`, "standard, 5 documents in sequence"],
    [`${Math.round(d.batchSeconds)} s`, "batch, 5 documents"],
    [usd(d.syncCost), "standard, computed"],
    [usd(d.batchCostAtBatchPrice), "batch, computed"],
  ] });
}

function emitSla(params, emit) {
  const sla = Number(params.get("sla") ?? 30);
  const interval = Number(params.get("interval") ?? 4.5);
  if (!(sla > 24) || !(interval > 0) || interval > 48) throw new Error("Give an SLA above 24 h and an interval between 0 and 48 h");
  const worst = worstCaseHours(interval);
  const met = worst <= sla;
  emit({ type: "card", title: `Submit every ${interval} h, SLA ${sla} h`, badge: met ? "SLA met" : "SLA missed", tone: met ? "good" : "warn", text: `Worst case: a document arrives just after a submission, waits ${interval} h, then a full 24 h window: ${worst} h.\nLongest interval that meets this SLA: ${maxIntervalHours(sla)} h.\nA request that expires at 24 h and must be resubmitted would miss it regardless.` });
}

async function emitStatus(emit) {
  for (const name of ["sample-v1-batch", "sample-v2-batch", "full-batch", "retry-batch"]) {
    const { id } = store.load(name);
    const batch = await client.messages.batches.retrieve(id);
    emit({ type: "card", title: name, badge: batch.processing_status, tone: batch.processing_status === "ended" ? "good" : "warn", text: id, data: batch.request_counts });
  }
}

async function emitMini(emit) {
  const requests = buildRequests(["d13", "d20"], PROMPTS.v2);
  const batch = await client.messages.batches.create({ requests });
  emit({ type: "card", title: "Submitted", badge: batch.processing_status, tone: "tool", text: `${batch.id}. Waiting up to 10 minutes.` });
  const ended = await waitForEnd(batch.id, { maxMinutes: 10, onPoll: (b) => emit({ type: "card", title: new Date().toISOString().slice(11, 19), badge: b.processing_status, tone: "muted", data: b.request_counts }) });
  if (ended.processing_status !== "ended") {
    emit({ type: "card", title: "Still pending", badge: "no results", tone: "warn", text: `Not ended after 10 minutes. Batch ${batch.id}.` });
    return;
  }
  const byId = readResults(await collect(batch.id));
  const score = scoreByCustomId(byId);
  for (const [id, row] of Object.entries(byId)) emit({ type: "card", title: id, badge: row.usable ? "usable" : row.failure, tone: row.usable ? "good" : "warn", data: row.input ?? row.detail });
  emit({ type: "summary", items: [[`${failedIds(byId).length}`, "failed"], [pct(score.accuracy), "fields right"], [usd(estimateCost(FAST_MODEL, usageOf(byId), { batch: true })), "computed at batch price"]] });
}

export async function run(params, emit) {
  const mode = params.get("mode") ?? "saved";
  if (mode === "saved") return emitSaved(emit);
  if (mode === "sla") return emitSla(params, emit);
  if (mode === "status") return emitStatus(emit);
  if (mode === "mini") return emitMini(emit);
  throw new Error(`Unknown mode: ${mode}`);
}
