// Step 6 — latency. Instructs the coordinator to issue both Agent calls in a single response
// and confirms that actually happens. The sequential cost is reasoned through below rather than
// measured live — spawning one full subagent round trip after the other is additive by
// construction, so a second paid run would only confirm arithmetic.
//
// The SDK streams each tool_use block of one model response as its own assistant message, all
// sharing the same message.id — so "same response" has to be counted by that id.
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
  const started = performance.now();
  const stream = query({
    prompt:
      "In a single response, issue two Agent tool calls at once: one spawning web-search (ask for " +
      "one short fact about EV batteries), one spawning doc-analysis (ask it to read " +
      "sample-report.md and report one short fact).",
    options: {
      ...baseOptions,
      cwd: exampleDir,
      allowedTools: ["Agent"],
      agents: { "web-search": WEB_SEARCH_AGENT, "doc-analysis": DOC_ANALYSIS_AGENT },
      maxTurns: 6,
    },
  });

  const now = () => Math.round(performance.now() - started);
  let firstResponseId = null;
  const inFirstResponse = [];
  const spans = {}; // tool_use id -> when that subagent's messages were first and last seen
  let costUsd = 0;
  for await (const message of stream) {
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      const agentCalls = message.message.content.filter((b) => b.type === "tool_use" && b.name === "Agent");
      if (agentCalls.length > 0) {
        firstResponseId ??= message.message.id;
        if (message.message.id === firstResponseId) {
          inFirstResponse.push(...agentCalls.map((b) => ({ id: b.id, agent: b.input?.subagent_type })));
        }
      }
    }
    if (message.parent_tool_use_id) {
      const span = (spans[message.parent_tool_use_id] ??= { first: now(), last: now() });
      span.last = now();
    }
    if (message.type === "result") costUsd += message.total_cost_usd ?? 0;
  }
  return { ranAt: new Date().toISOString(), inFirstResponse, spans, wallClockMs: now(), costUsd };
}

const store = resultStore(import.meta.url);
const data = await store.runOnce("step-6-parallel", observe);

const [a, b] = data.inFirstResponse.map((call) => data.spans[call.id]);
const overlapped = Boolean(a && b) && a.first < b.last && b.first < a.last;

console.log(`Agent calls issued in the coordinator's first response: ${data.inFirstResponse.map((c) => c.agent).join(", ")}`);
console.log(`Wall-clock time (parallel): ${data.wallClockMs} ms. Cost $${data.costUsd.toFixed(4)}.`);
console.log("Subagent activity, ms since start:", JSON.stringify(data.spans));
console.log(
  "\nSequential cost, reasoned rather than measured: spawned one after another, the coordinator " +
    "would wait for the first subagent's full round trip, THEN start the second, so the two " +
    "durations add instead of overlapping. Two independent tasks with no data dependency between " +
    "them gain nothing from waiting.\n"
);

check("Two Agent calls arrived in one model response", data.inFirstResponse.length === 2, String(data.inFirstResponse.length));
check("They went to the two different subagents", new Set(data.inFirstResponse.map((c) => c.agent)).size === 2);
check("Both subagents really ran", Boolean(a && b));
check("Their activity overlapped in time", overlapped, JSON.stringify([a, b]));
finishChecks();
