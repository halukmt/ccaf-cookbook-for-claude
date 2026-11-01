// One continuous coordinator session, rather than the two-call design this file started with.
// All three agents (web-search, doc-analysis,
// synthesis) are registered up front; the coordinator model itself is steered, through the
// prompt, to spawn the two research subagents in parallel and then hand their complete
// structured findings to synthesis, even if one of them fails. There is no Promise.all here —
// the parallelism is the SDK executing two Agent tool_use blocks that arrive in a single
// assistant message concurrently.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { baseOptions } from "./env.js";
import { WEB_SEARCH_AGENT, DOC_ANALYSIS_AGENT, SYNTHESIS_AGENT } from "./agents.js";
import { parseFindings, subagentTexts } from "./finding.js";

const exampleDir = dirname(fileURLToPath(import.meta.url));

// `queryFn` is the SDK's query() unless a test passes a scripted stream.
export async function runCoordinator(topic, { onEvent = () => {}, queryFn = query } = {}) {
  onEvent({ type: "start", topic });

  const stream = queryFn({
    prompt:
      `Research the topic "${topic}" and produce a fully cited report. ` +
      `In one response, start the doc-analysis and web-search subagents in parallel, by placing ` +
      `both Agent tool calls in that same response. Ask web-search to investigate: ${topic}. Ask ` +
      `doc-analysis to read sample-report.md and report one relevant finding. Once both return, ` +
      `spawn the synthesis subagent and pass it their complete structured findings — every field, ` +
      `not just the claim text. Do this even if one of the two research subagents failed or found ` +
      `nothing: synthesis should still write a report from whatever findings ARE available, and ` +
      `explicitly note which part of the research could not be completed and why. Never skip ` +
      `synthesis just because one side came back empty.`,
    options: {
      ...baseOptions,
      cwd: exampleDir,
      systemPrompt:
        "You run research by handing work to specialist subagents, then combining what they find.",
      allowedTools: ["Agent"],
      agents: {
        "web-search": WEB_SEARCH_AGENT,
        "doc-analysis": DOC_ANALYSIS_AGENT,
        synthesis: SYNTHESIS_AGENT,
      },
      maxTurns: 10,
      maxBudgetUsd: 2, // A full run cost $1.12 on 2026-10-31, above the shared $1 cap.
    },
  });

  // Which named subagent a parent_tool_use_id belongs to — read from the coordinator's own
  // Agent tool_use calls (subagent_type), not guessed from the subagent's text content.
  const agentNameByToolUseId = new Map();
  const findings = [];
  let report = "";
  let costUsd = 0;

  for await (const message of stream) {
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === "Agent" && block.input?.subagent_type) {
          agentNameByToolUseId.set(block.id, block.input.subagent_type);
        }
      }
    }
    if (message.type === "assistant" && message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          onEvent({ type: "subagentToolUse", parentId: message.parent_tool_use_id, tool: block.name });
        }
      }
    }
    for (const { agentToolUseId, text } of subagentTexts(message)) {
      const agentName = agentNameByToolUseId.get(agentToolUseId);
      if (!agentName) continue;
      if (agentName === "synthesis") {
        report = text;
        continue;
      }
      for (const finding of parseFindings(text, agentName)) {
        if (findings.some((known) => known.claim === finding.claim)) continue;
        findings.push(finding);
        onEvent({ type: "finding", finding });
      }
    }
    if (message.type === "result") costUsd += message.total_cost_usd ?? 0;
  }

  onEvent({ type: "report", text: report, findings, costUsd });
  // An empty report must not look like a finished run.
  if (!report.trim()) onEvent({ type: "error", message: "The run ended without a synthesis report." });
  return { findings, report, costUsd };
}
