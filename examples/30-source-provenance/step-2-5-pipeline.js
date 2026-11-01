// Steps 2 to 5: two subagents, one synthesis without an explicit attribution rule and one with it, then conflicts and
// rendering. Synthesis is expected to drop attribution unless told, so that is tested. Paid once, sequential.

import { check, finishChecks } from "../../_shared/check.js";
import { FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { KNOWN_CONFLICTS } from "../../_fixtures/research-conflicts.js";
import { ALL_DOCUMENTS, researchSubagent, SUBAGENTS, synthesiseFindings } from "./pipeline.js";
import { conflictProblems, groupByContentType, handleConflicts, mappingProblems, naiveProvenance, numberFindings, renderConflicts, renderReferences, renderSection, verifyProvenance } from "./provenance.js";

const store = resultStore(import.meta.url);
const TOPIC = "the spring protocol release";

const run = await store.runOnce("pipeline", async () => {
  const subagents = [];
  for (const subagent of SUBAGENTS) subagents.push(await researchSubagent(TOPIC, subagent));
  const findings = subagents.flatMap((s) => s.findings);
  const plain = await synthesiseFindings(findings, { attributionRule: false });
  const attributed = await synthesiseFindings(findings);
  return { subagents, plain: { report: plain.report, usage: plain.usage, stopReason: plain.stopReason }, attributed: { report: attributed.report, usage: attributed.usage, stopReason: attributed.stopReason } };
});

// Step 2
const raw = run.subagents.flatMap((s) => s.findings);
const mappingIssues = raw.map((finding) => ({ finding, problems: mappingProblems(finding, ALL_DOCUMENTS) }));
const clean = mappingIssues.filter((m) => m.problems.length === 0).map((m) => m.finding);
console.table(run.subagents.map((s) => ({ subagent: s.subagent, findings: s.findings.length })));
console.log(`Mappings: ${clean.length} of ${raw.length} verified against their source.`);
for (const m of mappingIssues.filter((x) => x.problems.length)) console.log(`  rejected: ${m.finding.claim}\n    ${m.problems.join("; ")}`);

const findings = numberFindings(raw);
const groups = handleConflicts(findings);
const conflicts = groups.filter((g) => g.conflictDetected);
console.log("\nFindings:");
for (const f of findings) console.log(` [${f.n}] (${f.measure}${f.value ? ` = ${f.value}` : ""}, ${f.publicationDate}) ${f.claim}`);

// Step 3
const plainCheck = verifyProvenance(run.plain.report, findings);
const attributedCheck = verifyProvenance(run.attributed.report, findings);
console.log(`\n--- WITHOUT an attribution rule ---\n${run.plain.report}`);
console.log(`\n--- WITH an attribution rule ---\n${run.attributed.report}`);
const line = (name, c) => ({ report: name, sentences: c.sentences, uncited: c.uncited.length, unknownCitations: c.unknownCitations.length, unsupportedNumbers: c.unsupportedNumbers.length, droppedFindings: c.dropped.length, of: findings.length });
console.table([line("without rule", plainCheck), line("with rule", attributedCheck)]);
for (const u of attributedCheck.uncited) console.log(`  uncited: ${u}`);
for (const u of attributedCheck.unsupportedNumbers) console.log(`  number not supported: ${u.number} in: ${u.sentence}`);
console.log(`  dropped with rule: ${attributedCheck.dropped.join(", ") || "none"}`);
console.log(`Marker counter on the attributed report: ${JSON.stringify(naiveProvenance(run.attributed.report, findings))}`);

// Step 4
console.log(`\n${renderConflicts(groups)}`);
const measures = conflicts.map((c) => c.measure);
for (const [measure, known] of Object.entries(KNOWN_CONFLICTS)) {
  const group = conflicts.find((c) => c.measure === measure);
  console.log(`Known conflict ${measure}: ${group ? `detected, values ${group.values.map((v) => v.value).join(" and ")}` : "NOT detected"}. ${known.note}`);
}
const statedInReport = conflictProblems(run.attributed.report, groups);
console.log(`Conflict values stated with their citation, attributed report: ${statedInReport.length === 0 ? "all" : statedInReport.join("; ")}`);
console.log(`Same test, report without the rule: ${conflictProblems(run.plain.report, groups).join("; ") || "all"}`);

// Step 5
const sections = groupByContentType(findings);
const rendered = sections.map((s) => `### ${s.contentType}\n${renderSection(s)}`).join("\n\n");
const finalReport = `${run.attributed.report}\n\n${renderConflicts(groups)}\n\n${rendered}\n\n${renderReferences(findings)}`;
console.log(`\n--- Rendered sections ---\n${rendered}`);

const usage = run.subagents.reduce((sum, s) => addUsage(sum, s.usage), {});
const sonnet = addUsage(addUsage({}, run.plain.usage), run.attributed.usage);
console.log(`\nComputed cost ${usd(estimateCost(FORCED_TOOL_MODEL, usage) + estimateCost(MODEL, sonnet))}.`);

check("Each subagent returned findings", run.subagents.every((s) => s.findings.length > 0));
check("Every mapping holds the five fields", raw.every((f) => ["claim", "sourceUrl", "documentName", "relevantExcerpt", "publicationDate"].every((key) => f[key])));
check("Every mapping verifies against its own document, including a word-for-word excerpt", mappingIssues.every((m) => m.problems.length === 0), `${clean.length} of ${raw.length}`);
check("Each subagent cites only its own documents", run.subagents.every((s, i) => s.findings.every((f) => ALL_DOCUMENTS.filter((d) => SUBAGENTS[i].docs.includes(d.id)).some((d) => d.url === f.sourceUrl))));
check("Synthesis finished normally", run.plain.stopReason === "end_turn" && run.attributed.stopReason === "end_turn");
check("The attributed report has real content", attributedCheck.sentences >= 3);
check("With the rule, no sentence is uncited", attributedCheck.uncited.length === 0, `${attributedCheck.uncited.length} of ${attributedCheck.sentences}`);
check("With the rule, every citation exists", attributedCheck.unknownCitations.length === 0);
check("With the rule, every stated number is in what the sentence cites", attributedCheck.unsupportedNumbers.length === 0, attributedCheck.unsupportedNumbers.map((u) => u.number).join(", "));
check("With the rule, no finding was dropped", attributedCheck.dropped.length === 0, attributedCheck.dropped.join(", "));
check("All three known conflicts were detected by code", Object.keys(KNOWN_CONFLICTS).every((m) => measures.includes(m)), measures.join(", "));
check("Each known conflict has the document's real values", Object.entries(KNOWN_CONFLICTS).every(([measure, known]) => Object.values(known.values).every((value) => conflicts.find((c) => c.measure === measure)?.values.some((v) => v.value.toLowerCase().includes(value.toLowerCase())))));
check("Conflicts are annotated with an explanation, not resolved", conflicts.every((c) => c.possibleExplanation.includes("Values differ") && c.values.length >= 2));
check("The temporal conflict is offered as a trend", /change over time/.test(conflicts.find((c) => c.measure === "adoption_rate")?.possibleExplanation ?? ""));
check("The other two conflicts point at the method", ["migration_budget", "migration_duration"].every((m) => /timing is unlikely/.test(conflicts.find((c) => c.measure === m)?.possibleExplanation ?? "")));
// A known limit: comparing values per measure cannot see a disagreement in words.
const outage = findings.find((f) => /No customer outage/i.test(f.claim));
const dropped = findings.find((f) => /dropped sessions/i.test(f.claim));
check("Known limit: 'no outage' against 'dropped sessions' is not flagged by code", outage?.measure === "none" && dropped && !conflicts.some((c) => c.values.some((v) => v.n === outage.n)));
console.log(`Report without the rule discusses that tension: ${/dropped sessions[\s\S]*outage|outage[\s\S]*dropped sessions/i.test(run.plain.report)}. With the rule: says the two differ: ${/whether that counts|differ|tension|however/i.test(run.attributed.report.split("**Gateways.**")[1] ?? "")}.`);
check("The model's report states each conflicting value with its own citation", statedInReport.length === 0, statedInReport.join("; "));
check("Rendering uses more than one format", new Set(sections.map((s) => s.contentType)).size >= 2);
check("A table is used for financial data", sections.some((s) => s.contentType === "financial") && rendered.includes("| Year | Value | Source |"));
check("Every rendered finding keeps its citation", findings.every((f) => rendered.includes(`[${f.n}]`)));
check("The references name every finding's source, date and URL", findings.every((f) => renderReferences(findings).includes(`[${f.n}] ${f.documentName}, ${f.publicationDate}. ${f.sourceUrl}`)));

store.save("analysis", {
  findings, mappingProblems: mappingIssues.filter((m) => m.problems.length).map((m) => ({ claim: m.finding.claim, problems: m.problems })),
  plainCheck, attributedCheck, conflicts: conflicts.map(({ measure, values, possibleExplanation, gapDays }) => ({ measure, values, possibleExplanation, gapDays })),
  rendered, finalReport,
});
finishChecks();
