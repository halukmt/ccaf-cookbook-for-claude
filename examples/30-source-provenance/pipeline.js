// The live part: two research subagents, then a synthesis. Each subagent sees a different document set, so the
// conflicts only appear once their results come together. Documents are local; no network.

import { DOCUMENTS } from "../../_fixtures/research.js";
import { CONFLICT_DOCUMENTS } from "../../_fixtures/research-conflicts.js";
import { client, FORCED_TOOL_MODEL, MODEL } from "../../_shared/client.js";
import { CLAIM_SOURCE_SCHEMA, numberFindings } from "./provenance.js";

export const ALL_DOCUMENTS = [...DOCUMENTS, ...CONFLICT_DOCUMENTS];

export const SUBAGENTS = [
  { name: "market", focus: "adoption and migration budgets", docs: ["DOC-1", "DOC-3", "DOC-4"] },
  { name: "operations", focus: "migration effort, gateway patches and timelines", docs: ["DOC-2", "DOC-5", "DOC-6"] },
];
// The budget conflict spans both subagents: market sees DOC-3's figure, operations sees DOC-5's. Neither can notice it
// alone. The other two conflicts sit within one subagent's documents. Both report every figure, whatever their focus.

const REPORT_TOOL = {
  name: "report_findings",
  description: "Return what the documents state, each finding with its complete source details. All fields are required on every finding.",
  input_schema: { type: "object", properties: { findings: { type: "array", items: CLAIM_SOURCE_SCHEMA } }, required: ["findings"] },
};

const formatDocument = (doc) => `<document url="${doc.url}" title="${doc.title}" date="${doc.date}" type="${doc.type}">\n${doc.text}\n</document>`;

export async function researchSubagent(topic, subagent) {
  const docs = ALL_DOCUMENTS.filter((doc) => subagent.docs.includes(doc.id));
  const response = await client.messages.create({
    model: FORCED_TOOL_MODEL,
    max_tokens: 2500,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_findings" },
    messages: [{
      role: "user",
      content: `Research ${subagent.focus} for ${topic}, using only these documents. Report one finding per specific fact, covering every budget, duration, percentage and date you see, whatever the focus. ` +
        "Use the document's url, title and date exactly. Copy relevantExcerpt word for word from the document.\n\n" +
        docs.map(formatDocument).join("\n\n"),
    }],
  });
  const tool = response.content.find((block) => block.type === "tool_use");
  if (!tool || !Array.isArray(tool.input.findings)) throw new Error(`No findings from ${subagent.name}: ${response.stop_reason}`);
  return { subagent: subagent.name, findings: tool.input.findings, usage: response.usage };
}

export async function synthesiseFindings(findings, { attributionRule = true } = {}) {
  const numbered = numberFindings(findings);
  const input = numbered.map(({ n, claim, documentName, publicationDate, value, measure }) => ({ n, claim, documentName, publicationDate, value, measure }));
  const rule = attributionRule
    ? "CRITICAL: every sentence must end in the inline citations [n] of the findings that support it. Never write \"research shows\" unless a citation names the research meant. " +
      "Where findings report different values for one measure, state each value with its own citation and its date, and do not choose between them. Add no reference list: one is added afterwards. "
    : "";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [{
      role: "user",
      content: `Combine the findings below into one coherent report of a few short paragraphs. ${rule}Use only these findings.\n\nFindings:\n${JSON.stringify(input, null, 2)}`,
    }],
  });
  return { report: response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(), usage: response.usage, stopReason: response.stop_reason, numbered };
}
