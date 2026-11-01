// Step 5: one real synthesis over the simulated outcomes, then code checks of its coverage. Also feeds the checker
// forged reports, because a checker that passes everything would look exactly like one that works.

import { check, finishChecks } from "../../_shared/check.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { addCoverageAnnotations, coverageProblems, reviewFindings, runResearch } from "./coordinator.js";
import { createDatabase, TOPICS } from "./mock-database.js";
import { renderReport, synthesise } from "./synthesis.js";

const store = resultStore(import.meta.url);
const noWait = async () => {};
const { subagentResults, log } = await runResearch(TOPICS, {
  database: createDatabase(), sleep: noWait, dateRangeFor: (topic) => (topic === "migration dates" ? "Q2" : undefined),
});

const saved = await store.runOnce("synthesis", async () => ({ model: FORCED_TOOL_MODEL, ...(await synthesise(subagentResults)) }));
// The raw model output goes through the code check first. What it rejects never counts as a finding.
const review = reviewFindings(saved.findings, subagentResults);
const report = addCoverageAnnotations({ findings: review.accepted }, subagentResults, TOPICS);
const rendered = renderReport(report, review);
console.log(rendered);
console.log(`\nCaveat:\n${report.caveat}`);
console.log(`\nComputed cost ${usd(estimateCost(saved.model, saved.usage))}.`);

const statusOf = (topic) => report.coverageAnnotations.find((c) => c.topic === topic)?.status;
check("The synthesis produced findings", saved.findings.length > 0, `${saved.findings.length} findings`);
check("Coverage lists all nine topics once", report.coverageAnnotations.length === TOPICS.length && new Set(report.coverageAnnotations.map((c) => c.topic)).size === TOPICS.length);
check("Well-supported topics are marked so", ["session tokens", "rollout speed", "vendor pricing", "migration dates"].every((t) => statusOf(t) === "well-supported"));
check("A partial topic is limited, stating the count", statusOf("gateway patches") === "limited" && /3 of 5/.test(report.coverageAnnotations.find((c) => c.topic === "gateway patches").reason));
check("A failed access is unavailable", ["regional rollout", "security audit", "legal exemption"].every((t) => statusOf(t) === "unavailable"));
check("A valid empty result is no-evidence-found, not unavailable", statusOf("customer outages") === "no-evidence-found");
check("Failed topics appear in the caveat with their reason", /regional rollout is unavailable: transient failure/.test(report.caveat) && /security audit is unavailable: permission failure/.test(report.caveat) && /legal exemption is unavailable: business failure/.test(report.caveat));
check("Coverage sits in its own section of the report", rendered.indexOf("## Coverage") > rendered.indexOf("## Findings") && rendered.includes("regional rollout: unavailable"));
const problems = coverageProblems(report, subagentResults);
console.log(`
Of ${saved.findings.length} model findings: ${review.accepted.length} accepted, ${review.flagged.length} of those flagged, ${review.rejected.length} rejected.`);
check("After the review, the report's coverage and findings hold", problems.length === 0, problems.join("; "));
check("No accepted finding sits on a failed topic", !review.accepted.some((f) => ["regional rollout", "security audit", "legal exemption"].includes(f.topic)));
check("The model's invented 'gaps in coverage' topic, with no source, was rejected", review.rejected.some(({ finding }) => finding.topic === "gaps in coverage"));
check("The outage claim from another topic's document is kept and flagged, not silently merged", review.flagged.some(({ finding }) => finding.topic === "customer outages"));
check("Rejections and flags are visible in the report", rendered.includes("## Rejected by the code check") && rendered.includes("## Findings using a source from another topic"));

// Forged reports: each must be caught.
const url = "https://docs.internal.com/mcp/spec-changes.md";
const forge = (change) => coverageProblems(change({ ...report, coverageAnnotations: report.coverageAnnotations.map((c) => ({ ...c })), findings: [...report.findings] }), subagentResults);
check("Catches a claim on a failed topic", forge((r) => ({ ...r, findings: [...r.findings, { topic: "security audit", claim: "Passed.", sources: [url] }] })).length > 0);
check("Catches a claim with no source", forge((r) => ({ ...r, findings: [...r.findings, { topic: "session tokens", claim: "Fine.", sources: [] }] })).length > 0);
check("Catches a source nothing retrieved", forge((r) => ({ ...r, findings: [...r.findings, { topic: "rollout speed", claim: "Fine.", sources: ["https://made.up/1"] }] })).length > 0);
check("Catches a dropped topic", forge((r) => ({ ...r, coverageAnnotations: r.coverageAnnotations.filter((c) => c.topic !== "security audit") })).length > 0);
check("Catches an empty result filed as an outage", forge((r) => ({ ...r, coverageAnnotations: r.coverageAnnotations.map((c) => (c.topic === "customer outages" ? { ...c, status: "unavailable" } : c)) })).length > 0);
check("Catches an outage filed as well-supported", forge((r) => ({ ...r, coverageAnnotations: r.coverageAnnotations.map((c) => (c.topic === "security audit" ? { ...c, status: "well-supported" } : c)) })).length > 0);

store.save("outcomes", { subagentResults, log });
finishChecks();
