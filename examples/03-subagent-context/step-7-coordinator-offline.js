// The final coordinator, driven by a scripted stream. No model and no cost. It checks the code's
// reading of the stream, and that a run with no report says so. It does not replace a live run.

import { check, finishChecks } from "../../_shared/check.js";
import { runCoordinator } from "./coordinator.js";
import { SCRIPTED_REPORT, scriptedQuery } from "./scripted-stream.js";

const events = [];
const result = await runCoordinator("scripted topic", {
  onEvent: (event) => events.push(event),
  queryFn: scriptedQuery(),
});

const emptyEvents = [];
const empty = await runCoordinator("scripted topic", {
  onEvent: (event) => emptyEvents.push(event),
  queryFn: scriptedQuery({ synthesisText: "" }),
});

check("The report is the synthesis agent's text and nothing else", result.report === SCRIPTED_REPORT);
check("Findings come from both research agents", new Set(result.findings.map((f) => f.retrieved_by)).size === 2);
check("Each keeps its source metadata", result.findings.some((f) => f.source_url) && result.findings.some((f) => f.page_number === 3));
check("Synthesis output is not parsed as findings", result.findings.length === 2);
check("The viewer gets findings, subagent tool calls and the report", ["finding", "subagentToolUse", "report"].every((type) => events.some((e) => e.type === type)));
check("A successful run raises no error", !events.some((e) => e.type === "error"));
check("A run with no report raises a visible error", empty.report === "" && emptyEvents.some((e) => e.type === "error"));
finishChecks();
