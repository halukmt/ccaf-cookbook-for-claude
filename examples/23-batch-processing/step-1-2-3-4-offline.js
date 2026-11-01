// Steps 1 to 4, without spending anything: the workflow table, the 20-request definition, failure
// handling against constructed results, and the SLA arithmetic. Real batches follow in the next scripts.

import { check, finishChecks } from "../../_shared/check.js";
import { DOCUMENTS } from "../../_fixtures/documents-answers.js";
import { EXTRACT_TOOL, buildRequests, buildRetryRequests, classifyResult, docIdOf, failedIds, readResults, requestFor } from "./batch.js";
import { PROMPTS } from "./prompts.js";
import { WORKFLOWS, latestSubmission, maxIntervalHours, worstCaseHours } from "./workflows.js";

// Step 1
console.table(WORKFLOWS);
check("Five workflows, with a reason each", WORKFLOWS.length === 5 && WORKFLOWS.every((w) => w.reason && w.waiting));
check("Both kinds appear", WORKFLOWS.some((w) => w.type === "synchronous") && WORKFLOWS.some((w) => w.type === "batch"));
check("Where a person is blocked, it is synchronous", WORKFLOWS.filter((w) => /blocked|customer/i.test(w.waiting)).every((w) => w.type === "synchronous"));

// Step 2
const ids = DOCUMENTS.map((d) => d.id);
const requests = buildRequests(ids, PROMPTS.v1);
console.log("First request:", JSON.stringify({ custom_id: requests[0].custom_id, model: requests[0].params.model, max_tokens: requests[0].params.max_tokens }));
check("Twenty requests", requests.length === 20);
check("Every custom_id is unique", new Set(requests.map((r) => r.custom_id)).size === 20);
check("Every custom_id fits the API's format", requests.every((r) => /^[a-zA-Z0-9_-]{1,64}$/.test(r.custom_id)));
check("Each custom_id leads back to its document", requests.every((r, i) => docIdOf(r.custom_id) === ids[i]));
check("Each request has its own params and the document text", requests.every((r) => r.params.model && r.params.max_tokens && r.params.messages[0].content.length > 20));

// Step 3, against constructed results of each kind
const message = (stop, content) => ({ content, stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } });
const good = { custom_id: requests[1].custom_id, result: { type: "succeeded", message: message("tool_use", [{ type: "tool_use", name: EXTRACT_TOOL.name, input: {} }]) } };
const errored = { custom_id: requests[0].custom_id, result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "bad" } } } };
const truncated = { custom_id: requests[2].custom_id, result: { type: "succeeded", message: message("max_tokens", [{ type: "tool_use", name: EXTRACT_TOOL.name, input: {} }]) } };
const expired = { custom_id: requests[3].custom_id, result: { type: "expired" } };

check("A complete result is usable", classifyResult(good).usable === true);
check("An errored result is a failure", classifyResult(errored).failure === "errored");
check("Succeeded but cut off is a failure too", classifyResult(truncated).failure === "truncated");
check("An expired result is a failure", classifyResult(expired).failure === "expired");

const byId = readResults([errored, good, truncated, expired]);
check("Results in any order are found by custom_id", byId[requests[0].custom_id].failure === "errored" && byId[requests[1].custom_id].usable);
check("Only failures are listed", failedIds(byId).length === 3 && !failedIds(byId).includes(good.custom_id));
const retries = buildRetryRequests(byId, requests);
check("The retry batch holds only failures", retries.length === 3);
check("Retry IDs stay unique and keep the document", new Set(retries.map((r) => r.custom_id)).size === 3 && retries.every((r) => docIdOf(r.custom_id)));
const short = requestFor(DOCUMENTS[2], 2, PROMPTS.v1, { maxTokens: 30, id: truncated.custom_id });
check("Truncated retries get more tokens", buildRetryRequests({ [truncated.custom_id]: { usable: false, failure: "truncated" } }, [short])[0].params.max_tokens === 2000);

// Step 4
const deadline = new Date("2026-11-02T09:00:00");
const latest = latestSubmission(deadline, 30);
console.log(`\nSLA 30 h, window 24 h. Longest interval: ${maxIntervalHours(30)} h. Worst case at 6 h: ${worstCaseHours(6)} h, at 4.5 h: ${worstCaseHours(4.5)} h, at 7 h: ${worstCaseHours(7)} h.`);
console.log(`Report due Monday 09:00: latest submission ${latest.toString().slice(0, 21)}.`);
check("Latest submission is Sunday 03:00", latest.getDay() === 0 && latest.getHours() === 3);
check("An interval of 6 h just meets a 30 h SLA", worstCaseHours(6) === 30);
check("An interval of 4.5 h leaves a margin", worstCaseHours(4.5) < 30);
check("An interval of 7 h misses the SLA, so this test can say no", worstCaseHours(7) > 30);

finishChecks();
