// The synthesis model writes findings as data. Coverage is computed by code, never by the model, so a gap
// cannot be phrased away. The report is rendered from both.

import { client, FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { availableSources } from "./coordinator.js";

const REPORT_TOOL = {
  name: "report_synthesis",
  description: "Report findings, one per claim, each naming the sources behind it.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            topic: { type: "string" },
            claim: { type: "string" },
            sources: { type: "array", items: { type: "string" }, description: "Source URLs from the input" },
          },
          required: ["topic", "claim", "sources"],
        },
      },
    },
    required: ["findings"],
  },
};

export async function synthesise(subagentResults) {
  const input = subagentResults.map((result) => ({ topic: result.topic, status: result.status, message: result.message, sources: availableSources(result) }));
  const response = await client.messages.create({
    model: FORCED_TOOL_MODEL,
    max_tokens: 1500,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_synthesis" },
    messages: [{
      role: "user",
      content: "Write research findings from these subagent results. Use only the sources given. Each claim names the source URLs behind it.\n\n" +
        JSON.stringify(input, null, 2),
    }],
  });
  const tool = response.content.find((block) => block.type === "tool_use");
  if (!tool || !Array.isArray(tool.input.findings)) throw new Error(`No findings returned, stop_reason ${response.stop_reason}`);
  return { findings: tool.input.findings, usage: response.usage };
}

export function renderReport(report, review = { flagged: [], rejected: [] }) {
  const section = (title, lines) => `## ${title}\n${lines.join("\n")}`;
  const findings = report.findings.map((f) => `- [${f.topic}] ${f.claim} (${f.sources.join(", ")})`);
  const coverage = report.coverageAnnotations.map((c) => `- ${c.topic}: ${c.status}. ${c.reason}`);
  const parts = [section("Findings", findings), section("Coverage", coverage)];
  if (review.flagged.length) parts.push(section("Findings using a source from another topic", review.flagged.map(({ finding, reason }) => `- [${finding.topic}] ${reason}`)));
  if (review.rejected.length) parts.push(section("Rejected by the code check", review.rejected.map(({ finding, reason }) => `- [${finding.topic}] ${reason}: ${finding.claim}`)));
  return parts.join("\n\n");
}
