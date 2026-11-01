// Building, tracking and reading Message Batches. The batch ID is saved before any waiting starts, so
// an interrupted script resumes instead of paying again.

import { client, FAST_MODEL } from "../../_shared/client.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage } from "../../_shared/pricing.js";
import { documentText, getDocument, scoreExtraction, tallyOutcomes } from "../../_fixtures/documents-answers.js";

export const store = resultStore(import.meta.url);

const text = { type: ["string", "null"] };
export const EXTRACT_TOOL = {
  name: "extract_document",
  description: "Record the data of one document. Use null for anything it does not state.",
  input_schema: {
    type: "object",
    properties: {
      invoice_number: text, vendor_name: text,
      document_date: { type: ["string", "null"], description: "ISO 8601, YYYY-MM-DD" },
      due_date: { type: ["string", "null"], description: "ISO 8601, YYYY-MM-DD" },
      payment_terms: text, purchase_order: text, tax_id: text,
      currency: { type: ["string", "null"], description: "ISO 4217 code" },
      total_amount: { type: ["number", "null"] },
      line_items: {
        type: "array",
        items: { type: "object", properties: { description: { type: "string" }, amount: { type: "number" } }, required: ["description", "amount"] },
      },
    },
    required: ["invoice_number", "vendor_name", "document_date", "due_date", "payment_terms", "purchase_order", "tax_id", "currency", "total_amount", "line_items"],
  },
};

// Type and position in the ID: results can then be read at a glance, and looked up without a position.
export const customId = (doc, index) => `doc-${doc.type}-${String(index).padStart(3, "0")}-${doc.id}`;
export const docIdOf = (custom) => custom.match(/(d\d{2})(?:-retry-\d+)?$/)?.[1];

export function requestFor(doc, index, system, { model = FAST_MODEL, maxTokens = 2000, id } = {}) {
  return {
    custom_id: id ?? customId(doc, index),
    params: {
      model,
      max_tokens: maxTokens,
      system,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name, disable_parallel_tool_use: true },
      messages: [{ role: "user", content: documentText(doc) }],
    },
  };
}

export const buildRequests = (docIds, system, options) => docIds.map((id, i) => requestFor(getDocument(id), i, system, options));

// Submits once. A saved record means the batch already exists, and it is reused.
export async function submitOnce(name, buildAndCreate) {
  if (store.has(name) && !process.argv.includes("--force")) {
    const saved = store.load(name);
    console.log(`Batch already submitted: ${saved.id}. Resuming, no new batch.`);
    return saved;
  }
  const { batch, ...extra } = await buildAndCreate();
  return store.save(name, { id: batch.id, createdAt: batch.created_at, submittedAt: new Date().toISOString(), ...extra });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForEnd(id, { maxMinutes = 15, pollSeconds = 20, onPoll = () => {} } = {}) {
  const deadline = Date.now() + maxMinutes * 60_000;
  let batch = await client.messages.batches.retrieve(id);
  onPoll(batch);
  while (batch.processing_status !== "ended" && Date.now() < deadline) {
    await pause(pollSeconds * 1000);
    batch = await client.messages.batches.retrieve(id);
    onPoll(batch);
  }
  return batch;
}

// Order is kept as received, to show whether it differed from the request order.
export async function collect(id) {
  const rows = [];
  for await (const entry of await client.messages.batches.results(id)) rows.push(entry);
  return rows;
}

// A result counts as usable only with a complete tool call. "succeeded" alone also covers a reply cut off at max_tokens.
export function classifyResult(entry) {
  const { result } = entry;
  if (result.type !== "succeeded") {
    return { usable: false, failure: result.type, detail: result.error?.error?.message ?? result.error?.type ?? null };
  }
  const { message } = result;
  const block = message.content.find((b) => b.type === "tool_use");
  if (message.stop_reason === "max_tokens") return { usable: false, failure: "truncated", detail: `stop_reason max_tokens, ${message.usage.output_tokens} tokens` };
  if (!block) return { usable: false, failure: "no_tool_call", detail: `stop_reason ${message.stop_reason}` };
  return { usable: true, input: block.input };
}

// Everything keyed by custom_id, never by position.
export function readResults(entries) {
  const byId = {};
  for (const entry of entries) {
    byId[entry.custom_id] = {
      ...classifyResult(entry),
      type: entry.result.type,
      usage: entry.result.message?.usage ?? null,
      model: entry.result.message?.model ?? null,
    };
  }
  return byId;
}

export const failedIds = (byId) => Object.keys(byId).filter((id) => !byId[id].usable);

// Only failures go back, each with a change aimed at its failure.
export function buildRetryRequests(byId, originalRequests, attempt = 1) {
  return failedIds(byId).map((id) => {
    const original = originalRequests.find((r) => r.custom_id === id);
    if (!original) throw new Error(`No original request for ${id}`);
    const failure = byId[id].failure;
    const params = { ...original.params };
    if (failure === "truncated") params.max_tokens = Math.max(2000, original.params.max_tokens * 2);
    if (failure === "errored") {
      params.model = FAST_MODEL;
      params.tool_choice = { type: "tool", name: EXTRACT_TOOL.name, disable_parallel_tool_use: true };
      params.max_tokens = Math.max(2000, original.params.max_tokens);
    }
    return { custom_id: `${id}-retry-${attempt}`, params };
  });
}

export function scoreByCustomId(byId) {
  const perDoc = Object.entries(byId)
    .filter(([, row]) => row.usable)
    .map(([id, row]) => {
      const doc = getDocument(docIdOf(id));
      const outcomes = scoreExtraction(doc, row.input);
      return { id, doc: doc.id, outcomes, allRight: Object.values(outcomes).every((o) => o === "correct" || o === "correct_null") };
    });
  const tally = tallyOutcomes(perDoc.map((p) => p.outcomes));
  return {
    perDoc,
    tally,
    accuracy: tally.fields ? (tally.correct + tally.correct_null) / tally.fields : 0,
    docsRight: perDoc.filter((p) => p.allRight).length,
    docs: perDoc.length,
    wrongFields: perDoc.flatMap((p) => Object.entries(p.outcomes).filter(([, o]) => o !== "correct" && o !== "correct_null").map(([field, outcome]) => ({ doc: p.doc, field, outcome, got: JSON.stringify(byId[p.id].input[field])?.slice(0, 70) }))),
  };
}

export function usageOf(byId) {
  return Object.values(byId).reduce((total, row) => addUsage(total, row.usage), { input_tokens: 0, output_tokens: 0 });
}
