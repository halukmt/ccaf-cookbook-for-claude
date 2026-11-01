// Step 1 — Run the coordinator on a deliberately broad topic.
//
// "Renewable energy technologies" is broad on purpose:
// step 6 checks whether all six energy types survive the decomposition.

import { check, finishChecks } from "../../_shared/check.js";
import { runCoordinator, COORDINATOR_SYSTEM_PROMPT, SUBAGENTS, MIN_SUBTOPICS } from "./coordinator.js";

console.log("=== The system prompt that defines the hub role ===\n");
console.log(COORDINATOR_SYSTEM_PROMPT);

const report = await runCoordinator("renewable energy technologies");

console.log("");
check("The system prompt forbids the hub from researching itself", /never research/i.test(COORDINATOR_SYSTEM_PROMPT));
check("Two subagents are registered with descriptions", SUBAGENTS.length === 2 && report.availableSubagents.length === 2 && SUBAGENTS.every((a) => a.description && a.systemPrompt));
check("The framing has a goal and a breadth note", report.goal?.trim().length > 10 && report.breadthNote?.trim().length > 10, report.goal);
check("The topic was decomposed", report.subtopics.length >= MIN_SUBTOPICS, `${report.subtopics.length} subtopics`);
check("Subagents returned findings", report.findings.length > 0, `${report.findings.length} findings`);
check("Coverage was assessed in the report object", typeof report.coverage?.completeness === "number", String(report.coverage?.completeness));
check("A written report exists and names its limits", /coverage limitations/i.test(report.text ?? ""));
finishChecks();
