// A scripted stand-in for the SDK's query(): the messages a coordinator run emits, with no model and
// no cost. It tests how coordinator.js reads the stream, and lets the viewer be checked for free. It
// says nothing about how a real model behaves.

const assistant = (content, parent = null) => ({
  type: "assistant",
  parent_tool_use_id: parent,
  message: { id: "msg_scripted", content },
});
const agentCall = (id, agent) => ({ type: "tool_use", id, name: "Agent", input: { subagent_type: agent, prompt: "scripted" } });
const toolResult = (id, text) => ({
  type: "user",
  parent_tool_use_id: null,
  message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] },
});

const WEB_FINDING = { claim: "Scripted web claim.", source_url: "https://example.test/web", confidence: "medium" };
const DOC_FINDING = { claim: "Scripted document claim.", document_name: "sample-report.md", page_number: 3, confidence: "high" };

export const SCRIPTED_REPORT = "Scripted report. Web claim (https://example.test/web). Document claim (sample-report.md, page 3).";

export function scriptedQuery({ synthesisText = SCRIPTED_REPORT } = {}) {
  return async function* () {
    yield assistant([agentCall("web", "web-search")]);
    yield assistant([agentCall("doc", "doc-analysis")]);
    yield assistant([{ type: "tool_use", id: "s1", name: "WebSearch", input: {} }], "web");
    yield assistant([{ type: "tool_use", id: "r1", name: "Read", input: {} }], "doc");
    // Prose around the block: this must never be mistaken for the report.
    yield toolResult("web", `Search done.\n\`\`\`json\n${JSON.stringify(WEB_FINDING)}\n\`\`\``);
    yield toolResult("doc", `\`\`\`json\n${JSON.stringify([DOC_FINDING])}\n\`\`\``);
    yield assistant([agentCall("syn", "synthesis")]);
    yield toolResult("syn", synthesisText);
    yield { type: "result", total_cost_usd: 0 };
  };
}
