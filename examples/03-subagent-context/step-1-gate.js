// Step 1 — tests the claim that Task/Agent in allowedTools is a hard gate. Same coordinator prompt,
// same agent roster, four configurations. The checks pin what really happens on this SDK version
// rather than the claim: if a later version makes omission block spawning, they fail on purpose, and
// everything that relies on this result needs another look.
//
// Paid once: the observations are saved, and a new paid run needs --force.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { baseOptions } from "./env.js";
import { WEB_SEARCH_AGENT } from "./agents.js";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const PROMPT = "Use the Agent tool to spawn web-search and ask it to find one fact.";
const isSpawnTool = (name) => name === "Agent" || name === "Task";

async function run(label, extraOptions) {
  console.log(`\n${"=".repeat(70)}\n${label}\n${"=".repeat(70)}`);
  const stream = query({
    prompt: PROMPT,
    options: {
      ...baseOptions,
      cwd: exampleDir,
      agents: { "web-search": WEB_SEARCH_AGENT },
      maxTurns: 3,
      ...extraOptions,
    },
  });

  const spawnIds = new Set();
  const observed = { label, spawned: false, subagentReturned: false, toolsOffered: [], finalText: "", costUsd: 0, resultSubtype: null };
  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") observed.toolsOffered = message.tools ?? [];
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && isSpawnTool(block.name)) {
          observed.spawned = true;
          spawnIds.add(block.id);
        }
        if (block.type === "text") observed.finalText = block.text;
      }
    }
    if (message.type === "user" && !message.parent_tool_use_id && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === "tool_result" && spawnIds.has(block.tool_use_id) && !block.is_error) observed.subagentReturned = true;
      }
    }
    if (message.type === "result") {
      observed.costUsd += message.total_cost_usd ?? 0;
      observed.resultSubtype = message.subtype;
    }
  }
  console.log(`Spawned a subagent: ${observed.spawned}. Cost $${observed.costUsd.toFixed(4)}.`);
  console.log(`Coordinator's own words: ${observed.finalText.slice(0, 200)}`);
  return observed;
}

const store = resultStore(import.meta.url);
const data = await store.runOnce("step-1-gate", async () => ({
  ranAt: new Date().toISOString(),
  sdkVersion: JSON.parse(readFileSync(new URL("../../node_modules/@anthropic-ai/claude-agent-sdk/package.json", import.meta.url))).version,
  model: baseOptions.model,
  omitted: await run("allowedTools has no Agent", { allowedTools: ["Read"] }),
  omittedDontAsk: await run("allowedTools has no Agent, permissionMode dontAsk", { allowedTools: ["Read"], permissionMode: "dontAsk" }),
  included: await run("allowedTools includes Agent", { allowedTools: ["Read", "Agent"] }),
  disallowed: await run("Agent listed in disallowedTools", { allowedTools: ["Read", "Agent"], disallowedTools: ["Agent", "Task"] }),
}));

const arms = [data.omitted, data.omittedDontAsk, data.included, data.disallowed];
console.log(`\nSDK ${data.sdkVersion}, ${data.model}, run ${data.ranAt}`);
console.table(arms.map((a) => ({
  configuration: a.label,
  spawned: a.spawned,
  returned: a.subagentReturned,
  offeredSpawnTool: a.toolsOffered.some(isSpawnTool),
  cost: `$${a.costUsd.toFixed(4)}`,
})));
console.log(`Total $${arms.reduce((sum, a) => sum + a.costUsd, 0).toFixed(4)}.\n`);

check("Control: with Agent in allowedTools a subagent spawns and returns", data.included.spawned && data.included.subagentReturned);
check("Observed: leaving Agent out of allowedTools does NOT stop spawning", data.omitted.spawned && data.omitted.subagentReturned);
check("Observed: the same holds under permissionMode dontAsk", data.omittedDontAsk.spawned);
check("Observed: leaving it out does not remove it from the tools on offer", data.omitted.toolsOffered.some(isSpawnTool), data.omitted.toolsOffered.filter(isSpawnTool).join(", "));
check("disallowedTools does close the gate: nothing spawned", !data.disallowed.spawned);
check("disallowedTools removes it from the tools on offer", !data.disallowed.toolsOffered.some(isSpawnTool));
finishChecks();
