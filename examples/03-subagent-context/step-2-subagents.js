// Step 2 — each AgentDefinition's `tools` list scopes what a subagent can call. Asking a
// subagent to self-report its tools is NOT a reliable way to verify this (see notes.md — a live
// run got a confabulated generic tool list bearing no relation to the actual restriction). The
// only trustworthy check is which tool_use blocks a subagent actually emits in a real
// transcript, which is what this script inspects instead of asking.
//
// Paid once: the observations are saved, and a new paid run needs --force.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { baseOptions } from "./env.js";
import { WEB_SEARCH_AGENT, DOC_ANALYSIS_AGENT } from "./agents.js";

const exampleDir = dirname(fileURLToPath(import.meta.url));

async function observe() {
  const stream = query({
    prompt:
      "Spawn web-search and ask it to search for one fact about EV batteries. Then spawn " +
      "doc-analysis and ask it to read sample-report.md and report one finding. Report both " +
      "findings plainly.",
    options: {
      ...baseOptions,
      cwd: exampleDir,
      allowedTools: ["Agent"],
      agents: { "web-search": WEB_SEARCH_AGENT, "doc-analysis": DOC_ANALYSIS_AGENT },
      maxTurns: 8,
    },
  });

  const nameById = {};
  const toolsById = {};
  let costUsd = 0;
  for await (const message of stream) {
    if (message.type !== "assistant" && message.type !== "result") continue;
    if (message.type === "result") {
      costUsd += message.total_cost_usd ?? 0;
      continue;
    }
    for (const block of message.message.content) {
      if (block.type !== "tool_use") continue;
      if (!message.parent_tool_use_id && block.input?.subagent_type) nameById[block.id] = block.input.subagent_type;
      if (message.parent_tool_use_id) {
        const seen = (toolsById[message.parent_tool_use_id] ??= []);
        if (!seen.includes(block.name)) seen.push(block.name);
      }
    }
  }
  return { ranAt: new Date().toISOString(), costUsd, nameById, toolsById };
}

const store = resultStore(import.meta.url);
const data = await store.runOnce("step-2-subagents", observe);

const toolsOf = (name) =>
  Object.entries(data.nameById)
    .filter(([, agent]) => agent === name)
    .flatMap(([id]) => data.toolsById[id] ?? []);

console.log(`Declared for web-search: ${WEB_SEARCH_AGENT.tools.join(", ")}. Called: ${toolsOf("web-search").join(", ") || "(none)"}`);
console.log(`Declared for doc-analysis: ${DOC_ANALYSIS_AGENT.tools.join(", ")}. Called: ${toolsOf("doc-analysis").join(", ") || "(none)"}`);
console.log(`Cost $${data.costUsd.toFixed(4)}.\n`);

const stayedInside = (name, declared) => toolsOf(name).every((tool) => declared.includes(tool));
const spawned = Object.values(data.nameById);
check("Both subagents were spawned", spawned.includes("web-search") && spawned.includes("doc-analysis"), spawned.join(", "));
check("web-search really called a tool", toolsOf("web-search").length > 0);
check("doc-analysis really called a tool", toolsOf("doc-analysis").length > 0);
check("web-search called only its declared tools", stayedInside("web-search", WEB_SEARCH_AGENT.tools), toolsOf("web-search").join(", "));
check("doc-analysis called only its declared tools", stayedInside("doc-analysis", DOC_ANALYSIS_AGENT.tools), toolsOf("doc-analysis").join(", "));
finishChecks();
