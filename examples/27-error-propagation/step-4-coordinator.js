// Step 4: the coordinator's decisions, and the same simulated failures through the two anti-patterns. No model.

import { check, finishChecks } from "../../_shared/check.js";
import { addCoverageAnnotations, coordinatorRecovery, coverageProblems, runResearch } from "./coordinator.js";
import { createDatabase, TOPICS } from "./mock-database.js";

const noWait = async () => {};
const options = { sleep: noWait, dateRangeFor: (topic) => (topic === "migration dates" ? "Q2" : undefined) };

const database = createDatabase();
const { subagentResults, log } = await runResearch(TOPICS, { database, ...options });
console.table(subagentResults.map((r) => ({ topic: r.topic, status: r.status, type: r.failureType ?? "-", attempts: r.attempts, recovery: r.recovery.map((x) => x.action).join(" > ") || "-" })));
const byTopic = (topic) => subagentResults.find((r) => r.topic === topic);
const actions = (topic) => byTopic(topic).recovery.map((r) => r.action).join(",");

check("Every topic got an outcome, none vanished", subagentResults.length === TOPICS.length && TOPICS.every((t) => byTopic(t.topic)));
check("Success needs no recovery", actions("session tokens") === "" && actions("rollout speed") === "");
check("Empty result triggers no recovery and no retry", actions("customer outages") === "" && database.callsFor("customer outages") === 1);
check("Three partial sources are enough to proceed", actions("gateway patches") === "proceed_partial" && byTopic("gateway patches").status === "partial_failure");
check("A dead source moves to the alternative, and that succeeds", actions("vendor pricing") === "try_alternative" && byTopic("vendor pricing").status === "success" && database.callsFor("vendor pricing", "archive") === 1);
check("No alternative left: try it, narrow, then proceed with a visible gap", actions("regional rollout") === "try_alternative,retry_modified,proceed_with_gap" && byTopic("regional rollout").status === "error");
check("A validation failure is fixed and rerun", actions("migration dates") === "fix_query" && byTopic("migration dates").status === "success");
check("A permission failure alerts an administrator with no retry", actions("security audit") === "alert_admin" && database.callsFor("security audit") === 1);
check("A business failure goes to a person with no retry", actions("legal exemption") === "escalate_human" && database.callsFor("legal exemption") === 1);
check("The four failure types get four different actions", new Set(["transient", "validation", "permission", "business"].map((failureType) => coordinatorRecovery({ failureType, partialResults: [], alternativeApproaches: [] }).action)).size === 4);
check("An unknown failure type is escalated, not lost", coordinatorRecovery({ failureType: "mystery", partialResults: [], alternativeApproaches: [] }).action === "escalate_human");
check("Every recovery was logged", log.length === subagentResults.flatMap((r) => r.recovery).length && log.length > 0);

// Anti-pattern 1: swallow every failure and report what is left.
async function silentPipeline() {
  const db = createDatabase();
  const findings = [];
  for (const { topic } of TOPICS) {
    try { findings.push(...(await db.searchDatabase(topic, { dateRange: "Q2" }))); } catch { /* the whole mistake */ }
  }
  return { sources: findings.length, reportedGaps: 0 };
}

// Anti-pattern 2: the first failure stops everything.
async function terminatingPipeline() {
  const db = createDatabase();
  const findings = [];
  try {
    for (const { topic } of TOPICS) findings.push(...(await db.searchDatabase(topic, { dateRange: "2031-01-01/2031-12-31" })));
  } catch (error) {
    return { sources: 0, thrownAway: findings.length, error: error.message };
  }
  return { sources: findings.length, thrownAway: 0 };
}

const silent = await silentPipeline();
const terminated = await terminatingPipeline();
const report = addCoverageAnnotations({ findings: [] }, subagentResults, TOPICS);
const gaps = report.coverageAnnotations.filter((c) => c.status === "limited" || c.status === "unavailable").length;
const structuredSources = subagentResults.reduce((n, r) => n + (r.status === "success" ? r.results.length : r.partialResults.length), 0);
console.log(`Silent suppression: ${silent.sources} sources, ${silent.reportedGaps} gaps reported.`);
console.log(`Termination: ${terminated.sources} sources, ${terminated.thrownAway} thrown away (${terminated.error}).`);
console.log(`Structured propagation: ${structuredSources} sources, ${gaps} gaps reported.`);

check("Silent suppression hides real gaps", silent.reportedGaps === 0 && gaps > 0);
check("Termination throws away data that was already retrieved", terminated.sources === 0 && terminated.thrownAway > 0);
check("Structured propagation keeps more data than either", structuredSources > silent.sources && structuredSources > terminated.sources, `${structuredSources} vs ${silent.sources} and ${terminated.sources}`);
check("Coverage matches the real results", coverageProblems(report, subagentResults).length === 0, coverageProblems(report, subagentResults).join("; "));

finishChecks();
