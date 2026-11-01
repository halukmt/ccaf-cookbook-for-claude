// Step 3 — Delegation with explicit context passing.
//
// The claim of this step is easy to state and easy to nod along to: a subagent inherits nothing,
// so everything must be written into its prompt. The second half of this script tests that claim
// instead of asserting it — the same subagent, the same subtopic, one brief stripped of context.

import { check, finishChecks } from "../../_shared/check.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { runCoordinator, SUBAGENTS, buildSubagentBrief, reportCost } from "./coordinator.js";
import { client, FORCED_TOOL_MODEL } from "./client.js";

const events = [];
const report = await runCoordinator("renewable energy technologies", {
  onEvent: (event) => events.push(event),
  maxRefinementRounds: 0, // This step is about the two delegations, not the refinement of step 5.
});

const firstTitle = report.subtopics[0].title;
const firstFindings = report.findings.filter((f) => f.subtopic === firstTitle);
const subtopic = report.subtopics[1];
const brief = buildSubagentBrief({ report, subtopic, priorFindings: firstFindings });

console.log(`\n${"=".repeat(70)}\nThe brief one subagent actually received\n${"=".repeat(70)}`);
console.log(brief);

// --- The control: the same task with the context stripped out -----------------------------
console.log(`\n${"=".repeat(70)}\nControl: the same subtopic, context removed\n${"=".repeat(70)}`);

const starvedBrief = `Research this subtopic and return three to five findings: ${subtopic.title}`;
console.log(`brief sent: "${starvedBrief}"\n`);

// The same model the briefed subagent ran on, so the brief is the only thing that differs.
const response = await client.messages.create({
  model: FORCED_TOOL_MODEL,
  max_tokens: 2048,
  system: SUBAGENTS[1].systemPrompt,
  messages: [{ role: "user", content: starvedBrief }],
});

const controlText = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
console.log(controlText || "(no text)");

console.log(`\n${"=".repeat(70)}`);
console.log("Compare: the briefed agent knew the overall goal, its exact scope boundary, what the");
console.log("previous agent had already covered, and where to put anything out of scope. The");
console.log("control agent knew a title. Neither agent is better than the other — the coordinator is.");

const subagentRuns = events.filter((e) => e.type === "subagentResult");
const secondRun = subagentRuns[1];
const firstClaim = subagentRuns[0]?.findings[0]?.claim;
const cost = reportCost(report) + estimateCost(FORCED_TOOL_MODEL, addUsage({}, response.usage));
console.log(`\nComputed cost: ${usd(cost)}\n`);

check("Two subagents ran, one of each kind", subagentRuns.length === 2 && new Set(subagentRuns.map((r) => r.agent)).size === 2);
check("Each returned findings", subagentRuns.every((r) => r.findings.length > 0), subagentRuns.map((r) => r.findings.length).join(", "));
check("Every finding carries a source and a confidence", report.findings.every((f) => f.source.trim() && typeof f.confidence === "number"));
check("The real second brief named the topic, goal, subtopic and scope", [report.topic, report.goal, secondRun.subtopic, report.subtopics[1].scope].every((part) => secondRun.brief.includes(part)));
check("The real second brief carried the first agent's findings", Boolean(firstClaim) && secondRun.brief.includes(firstClaim));
check("The real second brief named its siblings", secondRun.brief.includes(report.subtopics[2].title));
check("The first brief says nobody came before it", subagentRuns[0].brief.includes("you are the first subagent"));
check("Uncovered subtopics are named, not hidden", report.notDelegated.length === report.subtopics.length - 2, `${report.notDelegated.length} of ${report.subtopics.length}`);
check("The control brief has no topic, goal or prior findings", !starvedBrief.includes(report.goal) && !starvedBrief.includes("Already established"));
check("The control call ended normally and produced text to compare", response.stop_reason === "end_turn" && controlText.trim().length > 0, response.stop_reason);
finishChecks();
