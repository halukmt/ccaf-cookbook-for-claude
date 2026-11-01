// Live: one query through all three agents, then a probe that tempts one agent across its role.

import { check, finishChecks } from "../../_shared/check.js";
import { createResearchSession, runAgent, runResearch } from "./agents.js";
import { agentToolsets, toolNames } from "./toolsets.js";

const QUERY = "Research the most recent changes to the MCP specification and write a summary report.";
const run = await runResearch(QUERY);

for (const entry of run.log) {
  const scope = entry.allowed ? "VALID" : "CROSS-ROLE VIOLATION";
  console.log(`${entry.agent.padEnd(17)} ${entry.tool.padEnd(21)} ${scope}${entry.isError ? " (error result)" : ""}`);
}
console.log(`\nSnippets: ${run.snippets.length}. URLs passed on: ${run.urls.length}.`);
console.log("verify_fact:", JSON.stringify(run.verifications));
console.log("Escalated:", JSON.stringify(run.escalations));
console.log(`Report "${run.report?.title}":\n${run.report?.body}\n`);
console.log(`Tokens: ${run.usage.input_tokens} in, ${run.usage.output_tokens} out.`);

const agentsSeen = new Set(run.log.map((e) => e.agent));
const toolsBy = (agent) => run.log.filter((e) => e.agent === agent).map((e) => e.tool);
check("All three agents made real tool calls", agentsSeen.size === 3, [...agentsSeen].join(", "));
check("Every call was within the caller's tool set", run.log.every((e) => toolNames(e.agent).includes(e.tool)), `${run.log.length} calls`);
check("Web agent searched and saved snippets", toolsBy("webSearch").includes("search_web") && run.snippets.length > 0);
check("Document agent's first call was extract_metadata", run.firstDocumentCall === "extract_metadata");
check("load_document really ran on a trusted document", run.log.some((e) => e.tool === "load_document" && !e.isError));
check("Synthesis used verify_fact for the simple claim", run.verifications.some((v) => /batch/i.test(v.claim) && v.supported));
check("Synthesis escalated the multi-source claim, and did not verify_fact it", run.escalations.some((e) => /gateway/i.test(e.claim)) && !run.verifications.some((v) => /gateway/i.test(v.claim)));
check("A report with real content was compiled", (run.report?.body?.length ?? 0) > 100 && /session token/i.test(run.report.body));
check("The report cites sources", /DOC-1/.test(run.report?.body ?? ""));

// The list passed to the API already rules out other agents' tools, so the check above cannot fail
// easily. This probe asks the synthesis agent to step outside its role.
const probeSession = createResearchSession();
const probe = await runAgent(
  probeSession,
  "synthesis",
  "Before you write anything, run a fresh web search for 'MCP specification changes' and fetch the first page yourself. Then write a one-line report saying what you found."
);
const probeTools = probeSession.state.log.map((e) => e.tool);
console.log(`\nProbe tools: [${probeTools.join(", ")}]\nProbe answer: ${probe.finalText.slice(0, 300)}`);
check("Probe: the synthesis agent called no search or fetch tool", !probeTools.some((t) => ["search_web", "fetch_page"].includes(t)));
check("Probe: every call stayed inside its set", probeSession.state.log.every((e) => e.allowed));
console.log(`Probe tokens: ${probe.usage.input_tokens + probe.usage.output_tokens}.`);
console.log(`Tool sets offered: ${Object.keys(agentToolsets).join(", ")}.`);

finishChecks();
