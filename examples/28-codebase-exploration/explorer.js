// Subagents as separate Messages API conversations, coordinated by code. Each one has its own history, so verbose file
// content stays in that history, and the coordinator only ever sees what report_findings carries.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { client, FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";
import { READ_TOOLS, readToolHandler, realFiles } from "./workspace.js";

export const REPORT_TOOL = {
  name: "report_findings",
  description: "Record what you found. Written to the shared scratchpad. Call it after each major discovery and before you finish.",
  input_schema: {
    type: "object",
    properties: {
      module: { type: "string", description: "The area investigated" },
      filePaths: { type: "array", items: { type: "string" }, description: "Files the findings refer to, exactly as listed" },
      functions: { type: "array", items: { type: "string" }, description: "Specific function names found" },
      dependencyChain: { type: "array", items: { type: "string" }, description: "Calls in order, for example placeOrder -> chargeCard" },
      criticalNote: { type: "string", description: "The most important finding, or None" },
      summary: { type: "string", description: "One or two sentences" },
    },
    required: ["module", "filePaths", "functions", "dependencyChain", "criticalNote", "summary"],
  },
};

const SYSTEM =
  "You investigate one question about a JavaScript codebase, using your tools. Base everything on what you really read. " +
  "If the code has no answer, say so plainly. When done, call report_findings, then reply with one short sentence.";

// This fixture is functions and not classes, so findings list functions.
export function formatFindings(findings) {
  return `## ${findings.module}\n` +
    `- Files: ${findings.filePaths.join(", ") || "none"}\n` +
    `- Functions: ${findings.functions.join(", ") || "none"}\n` +
    `- Dependencies: ${findings.dependencyChain.join(" -> ") || "none"}\n` +
    `- Critical: ${findings.criticalNote || "None"}\n` +
    `- Summary: ${findings.summary}`;
}

export function updateScratchpad(path, findings) {
  appendFileSync(path, `\n\n${formatFindings(findings)}`);
}
export const readScratchpad = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");

// One subagent. `checkpoint` runs after each report; `onToolCall` lets the crash test stop the process mid-task.
export async function delegateToSubagent(task, { code, scratchpadPath, contextBlock = "", model = MODEL, checkpoint = () => {}, onToolCall = () => {}, onEvent }) {
  const filesRead = [];
  const findings = [];
  const read = readToolHandler(code, filesRead);
  const pad = scratchpadPath ? readScratchpad(scratchpadPath) : "";
  const prompt = `${contextBlock}${pad ? `## Scratchpad from earlier exploration\n${pad}\n\n` : ""}## Your task\n${task.task}`;

  const result = await runToolLoop({
    prompt,
    system: SYSTEM,
    tools: [...READ_TOOLS, REPORT_TOOL],
    model,
    maxTokens: 2500,
    maxIterations: 20,
    onEvent,
    handleTool: (name, input) => {
      onToolCall(name, input);
      if (name !== "report_findings") return read(name, input);
      const unknown = input.filePaths.filter((file) => !realFiles().has(file));
      if (unknown.length) return { content: `These files do not exist: ${unknown.join(", ")}. Report paths exactly as listed.`, isError: true };
      findings.push(input);
      if (scratchpadPath) updateScratchpad(scratchpadPath, input);
      checkpoint(input, filesRead);
      return "Recorded.";
    },
  });
  if (findings.length === 0) throw new Error(`Subagent ${task.subagent} reported nothing (stop: ${result.stopReason})`);
  return { task: task.subagent, prompt, findings, filesRead, usage: result.usage, finalText: result.finalText, iterations: result.iterations };
}

const SUMMARY_TOOL = {
  name: "phase_summary",
  description: "Summarise an exploration phase for the agents of the next phase.",
  input_schema: {
    type: "object",
    properties: {
      architecture: { type: "string" },
      dependencyChain: { type: "string", description: "The main call chain, using real function names" },
      criticalIssue: { type: "string" },
      targets: { type: "array", items: { type: "string" }, description: "Specific files or functions the next phase should look at" },
    },
    required: ["architecture", "dependencyChain", "criticalIssue", "targets"],
  },
};

// Sees the subagents' structured findings only. Forced tool_choice needs FORCED_TOOL_MODEL.
export async function summarisePhase(findings) {
  const response = await client.messages.create({
    model: FORCED_TOOL_MODEL,
    max_tokens: 1500,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "phase_summary" },
    messages: [{ role: "user", content: `Summarise these exploration findings, concisely, using only what they state.\n\n${JSON.stringify(findings, null, 2)}` }],
  });
  const tool = response.content.find((block) => block.type === "tool_use");
  if (!tool) throw new Error(`No summary, stop_reason ${response.stop_reason}`);
  return { summary: tool.input, usage: response.usage };
}

export function buildPhase2Prompt(summary, task) {
  return `## Context from Phase 1 Exploration\nArchitecture: ${summary.architecture}\nKey dependency chain: ${summary.dependencyChain}\n` +
    `Critical concern: ${summary.criticalIssue}\nTargets: ${summary.targets.join("; ")}\n\n## Your Phase 2 Task\n${task}\n\n` +
    "Let the Phase 1 context direct this work. The architecture it describes is already known, so do not explore it again.";
}
