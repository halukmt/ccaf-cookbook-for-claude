// The coordinator: one recovery decision per failure, then coverage that says what is missing and why.

import { searchSubagent } from "./subagent.js";

export const MIN_PARTIAL_SOURCES = 3;
const MAX_ROUNDS = 3;

// Recovery by failure type. Anything unrecognised goes to a person, since a silent `undefined` would hide it.
export function coordinatorRecovery(failure, tried = new Set()) {
  switch (failure.failureType) {
    case "transient":
      if (failure.partialResults.length >= MIN_PARTIAL_SOURCES) return { action: "proceed_partial", data: failure.partialResults };
      if (!tried.has("try_alternative") && failure.alternativeApproaches.some((text) => /alternative/i.test(text))) {
        return { action: "try_alternative", approach: failure.alternativeApproaches.find((text) => /alternative/i.test(text)) };
      }
      if (!tried.has("retry_modified")) return { action: "retry_modified", modification: "narrower date range" };
      return { action: "proceed_with_gap", details: failure.message };
    case "validation":
      return tried.has("fix_query") ? { action: "proceed_with_gap", details: failure.message } : { action: "fix_query", details: failure.message };
    case "permission":
      return { action: "alert_admin", details: failure.attemptedAction };
    case "business":
      return { action: "escalate_human", context: failure };
    default:
      return { action: "escalate_human", context: failure };
  }
}

// One topic, through recovery. Every failure recorded here stays visible in the coverage later.
async function researchTopic(topic, options, log) {
  let result = await searchSubagent(topic, options);
  const tried = new Set();
  const recovery = [];

  for (let round = 0; round < MAX_ROUNDS && result.status !== "success"; round++) {
    const decision = coordinatorRecovery(result, tried);
    tried.add(decision.action);
    recovery.push({ action: decision.action, failureType: result.failureType, message: result.message });
    log.push({ topic, ...decision, context: undefined, data: decision.data?.length });

    if (decision.action === "try_alternative") {
      result = await searchSubagent(topic, { ...options, source: "archive" });
    } else if (decision.action === "retry_modified") {
      result = await searchSubagent(topic, { ...options, dateRange: "2031-05-01/2031-06-30" });
    } else if (decision.action === "fix_query") {
      result = await searchSubagent(topic, { ...options, dateRange: "2031-01-01/2031-12-31" });
    } else {
      break; // proceed_partial, proceed_with_gap, alert_admin, escalate_human: nothing more to run.
    }
  }
  return { ...result, recovery };
}

export async function runResearch(topics, { database, dateRangeFor = () => undefined, ...options }) {
  const log = [];
  const subagentResults = [];
  for (const { topic } of topics) {
    const dateRange = dateRangeFor(topic);
    subagentResults.push(await researchTopic(topic, { database, ...options, ...(dateRange ? { dateRange } : {}) }, log));
  }
  return { subagentResults, log };
}

// Four states, not three: filing a clean empty result under "unavailable" would bring back the very confusion
// between an empty answer and a failed search that this example exists to prevent.
export function addCoverageAnnotations(synthesis, subagentResults, topics = []) {
  const expectedFor = (topic) => topics.find((t) => t.topic === topic)?.expected;
  const coverage = subagentResults.map((outcome) => {
    const recovered = outcome.recovery?.length ? ` Recovered by: ${outcome.recovery.map((r) => r.action).join(", ")}.` : "";
    if (outcome.status === "success" && outcome.results.length > 0) {
      return { topic: outcome.topic, status: "well-supported", sources: outcome.results.length, reason: `${outcome.results.length} source(s).${recovered}` };
    }
    if (outcome.status === "success") {
      return { topic: outcome.topic, status: "no-evidence-found", sources: 0, reason: "The query ran and matched nothing. This is a finding, not an outage." };
    }
    if (outcome.status === "partial_failure") {
      const expected = expectedFor(outcome.topic);
      return {
        topic: outcome.topic, status: "limited", sources: outcome.partialResults.length,
        reason: `Only ${outcome.partialResults.length}${expected ? ` of ${expected}` : ""} expected sources available. ${outcome.message}`,
      };
    }
    const action = outcome.recovery?.at(-1)?.action;
    return { topic: outcome.topic, status: "unavailable", sources: 0, reason: `${outcome.failureType} failure: ${outcome.message}${action ? ` Action taken: ${action}.` : ""}` };
  });
  return {
    ...synthesis,
    coverageAnnotations: coverage,
    caveat: coverage.filter((entry) => entry.status !== "well-supported").map((entry) => `Section on ${entry.topic} is ${entry.status}: ${entry.reason}`).join("\n"),
  };
}

export const availableSources = (result) => (result.status === "success" ? result.results : result.partialResults ?? []);

// Sorts the model's findings. Rejected: no source, an invented topic or source, or a claim on a topic that could not
// be searched. Flagged: real, but supported by a source retrieved under another topic, so it is kept and marked.
export function reviewFindings(findings, subagentResults) {
  const everything = new Set(subagentResults.flatMap((r) => availableSources(r).map((s) => s.source)));
  const review = { accepted: [], flagged: [], rejected: [] };
  for (const finding of findings) {
    const result = subagentResults.find((r) => r.topic === finding.topic);
    const reject = (reason) => review.rejected.push({ finding, reason });
    if (!result) { reject("not a researched topic"); continue; }
    if (result.status === "error") { reject("a claim on a topic that could not be searched"); continue; }
    if (!finding.sources?.length) { reject("a claim with no source"); continue; }
    const unknown = finding.sources.filter((source) => !everything.has(source));
    if (unknown.length) { reject(`cites ${unknown.join(", ")}, which nothing retrieved`); continue; }
    review.accepted.push(finding);
    const own = availableSources(result).map((s) => s.source);
    const borrowed = finding.sources.filter((source) => !own.includes(source));
    if (borrowed.length) review.flagged.push({ finding, reason: `uses a source found under another topic: ${borrowed.join(", ")}` });
  }
  return review;
}

// Checks a synthesis against what subagents really returned. Returns problems, empty when it holds.
export function coverageProblems(report, subagentResults) {
  const problems = [];
  const annotations = report.coverageAnnotations ?? [];
  for (const result of subagentResults) {
    const entries = annotations.filter((c) => c.topic === result.topic);
    if (entries.length !== 1) { problems.push(`${result.topic}: ${entries.length} coverage entries`); continue; }
    const [entry] = entries;
    const sources = availableSources(result);
    const expectedStatus = result.status === "partial_failure" ? "limited" : result.status === "error" ? "unavailable" : sources.length ? "well-supported" : "no-evidence-found";
    if (entry.status !== expectedStatus) problems.push(`${result.topic}: marked ${entry.status}, should be ${expectedStatus}`);
    if (entry.status !== "well-supported" && !report.caveat?.includes(result.topic)) problems.push(`${result.topic}: gap missing from the caveat`);
    if (entry.status === "unavailable" && !/failure/.test(entry.reason)) problems.push(`${result.topic}: no failure reason`);
  }
  // Only accepted findings may reach the report.
  const review = reviewFindings(report.findings ?? [], subagentResults);
  for (const { finding, reason } of review.rejected) problems.push(`${finding.topic}: ${reason}`);
  return problems;
}
