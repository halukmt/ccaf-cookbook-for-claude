// Live: the three tool_choice modes, forced selection in an agent, and the alternative on a newer model.

import { client, FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { check, finishChecks } from "../../_shared/check.js";
import { createResearchSession, documentAgentOptions, runAgent } from "./agents.js";
import { agentToolsets } from "./toolsets.js";

const tools = agentToolsets.documentAnalysis.tools;
const totals = { fast: 0, sonnet: 0 };

async function firstCall(model, tool_choice, content) {
  const response = await client.messages.create({ model, max_tokens: 300, tools, tool_choice, messages: [{ role: "user", content }] });
  return { stop: response.stop_reason, tools: response.content.filter((b) => b.type === "tool_use").map((b) => b.name), usage: response.usage };
}

// 1. The three modes on a question that needs no tool, so the difference shows.
const CHAT = "Hello. In one short sentence, what are you for?";
for (const [label, choice] of [["auto", { type: "auto" }], ["any", { type: "any" }], ["named", { type: "tool", name: "extract_metadata" }]]) {
  const result = await firstCall(FORCED_TOOL_MODEL, choice, CHAT);
  console.log(`${label.padEnd(6)} ${FORCED_TOOL_MODEL}: stop=${result.stop} tools=[${result.tools}]`);
  if (label === "auto") check("auto: free to answer with no tool", result.stop === "end_turn" && result.tools.length === 0);
  if (label === "any") check("any: some tool is guaranteed", result.tools.length > 0);
  if (label === "named") check("named: exactly the named tool", result.tools.join() === "extract_metadata");
}

// 2. The forced modes on the default model.
for (const [label, choice] of [["any", { type: "any" }], ["named", { type: "tool", name: "extract_metadata" }]]) {
  const status = await firstCall(MODEL, choice, CHAT).then(() => 200, (error) => error.status);
  console.log(`${label.padEnd(6)} ${MODEL}: HTTP ${status}`);
  check(`${MODEL} rejects forced ${label} with a 400`, status === 400, `HTTP ${status}`);
}

const PROMPT = "Analyse this URL:\nhttps://docs.internal.com/mcp/spec-changes.md";

// 3. Forced first turn, then auto, in the real agent.
const forcedSession = createResearchSession();
const forced = await runAgent(forcedSession, "documentAnalysis", PROMPT, documentAgentOptions({ forced: true }));
const forcedTools = forcedSession.state.log.map((e) => e.tool);
console.log(`\nForced, then auto (${FORCED_TOOL_MODEL}): ${forcedTools.join(" -> ")}`);
check("Forced: extract_metadata ran first", forcedTools[0] === "extract_metadata");
check("Auto afterwards: the model went on to other tools", forcedTools.slice(1).some((t) => t !== "extract_metadata"));
totals.fast += forced.usage.input_tokens + forced.usage.output_tokens;

// 4. The alternative for models that reject forcing: auto, an instruction, strict schemas, and the code gate.
const strictTools = tools.map((t) => ({ ...t, strict: true }));
const autoSession = createResearchSession();
const auto = await runAgent(autoSession, "documentAnalysis", PROMPT, { model: MODEL, tools: strictTools, toolChoice: { type: "auto" } });
const autoLog = autoSession.state.log;
console.log(`Auto, instruction, strict (${MODEL}): ${autoLog.map((e) => e.tool).join(" -> ")}; gate refusals ${autoSession.state.gateRefusals}`);
check("strict: true is accepted on the default model with auto", autoLog.length > 0);
check("First tool to succeed is extract_metadata", autoLog.find((e) => !e.isError)?.tool === "extract_metadata");
check("Strict schema: the first call has exactly the declared property", Object.keys(autoLog[0].input).join() === "url");
totals.sonnet += auto.usage.input_tokens + auto.usage.output_tokens;

// 5. The code gate alone, with no model: this is what actually guarantees the order.
const gateSession = createResearchSession();
const handle = gateSession.handlerFor("documentAnalysis");
const early = handle("load_document", { url: "https://docs.internal.com/mcp/spec-changes.md" });
check("Gate: load_document before extract_metadata is refused", early.isError === true && gateSession.state.gateRefusals === 1);

console.log(`\nTokens in the two agent runs: fast ${totals.fast}, default ${totals.sonnet}.`);
finishChecks();
