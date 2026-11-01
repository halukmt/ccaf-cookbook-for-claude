// Adapter between the central server and the three-agent run.

import { runResearch } from "./agents.js";
import { documentUrlProblem, loadDocument } from "./load-document.js";

export async function run(params, emit) {
  if (params.get("mode") === "url") {
    const url = params.get("url")?.trim() ?? "";
    const problem = documentUrlProblem(url);
    emit({ type: "section", title: "load_document validation", text: "No model and no API call. Code decides." });
    emit({ type: "card", title: url || "(empty)", badge: problem ? "rejected" : "accepted", tone: problem ? "warn" : "good", text: problem ?? "A document URL from a trusted domain.", data: loadDocument({ url }) });
    return;
  }

  const query = params.get("query")?.trim();
  if (!query) throw new Error("missing query");
  const result = await runResearch(query, { onEvent: emit });

  emit({ type: "section", title: "Scope check", text: "Every call, by the agent that made it." });
  for (const entry of result.log) {
    emit({ type: "check", label: `${entry.agent}: ${entry.tool}`, pass: entry.allowed, detail: entry.allowed ? (entry.isError ? "allowed, returned an error" : "") : "cross-role attempt" });
  }
  if (result.report) emit({ type: "card", title: result.report.title, badge: "report", tone: "good", text: result.report.body });
  emit({
    type: "summary",
    items: [
      [result.log.length, "tool calls"],
      [result.log.filter((e) => !e.allowed).length, "cross-role attempts"],
      [result.firstDocumentCall ?? "none", "first document call"],
      [result.verifications.length, "verify_fact"],
      [result.escalations.length, "escalated"],
      [result.usage.input_tokens + result.usage.output_tokens, "tokens"],
    ],
  });
}
