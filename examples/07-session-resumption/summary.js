// Step 2: turns a session's findings into a structured summary holding conclusions only.
// A forced tool call gives a parsed object. Free-form JSON from the model parsed to nothing here twice.

import { client, FORCED_TOOL_MODEL } from "../../_shared/client.js";

const SUMMARY_TOOL = {
  name: "record_summary",
  description: "Record the review's conclusions per file. Short sentences, never any source code.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  description: { type: "string" },
                },
                required: ["severity", "description"],
              },
            },
            recommendation: { type: "string" },
          },
          required: ["file", "issues", "recommendation"],
        },
      },
    },
    required: ["files"],
  },
};

export function renderSummary(sessionName, files) {
  const lines = files.map((entry) => {
    const issues = entry.issues.map((issue) => `${issue.description} (${issue.severity})`).join("; ");
    return `- **${entry.file}**: ${issues || "No issues found"}. Recommendation: ${entry.recommendation}`;
  });
  return `# Session summary: ${sessionName}\n\n## Findings\n${lines.join("\n")}`;
}

export async function buildSummary(sessionName, reviewText) {
  const response = await client.messages.create({
    model: FORCED_TOOL_MODEL,
    max_tokens: 6000,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: SUMMARY_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Record every reviewed file from this code review, with each issue in one short sentence and no code.\n\n${reviewText}`,
      },
    ],
  });
  const files = response.content.find((block) => block.type === "tool_use")?.input?.files ?? [];
  return {
    files,
    markdown: renderSummary(sessionName, files),
    stopReason: response.stop_reason,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
