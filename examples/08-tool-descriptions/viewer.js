// Adapter between the central server and the routing harness.

import { publishedTools, RICH, VAGUE } from "./customer-tools-server.js";
import { CASES, HARD_CASES, measureRouting } from "./routing.js";
import { CONFLICTING_PROMPT, findToolBiasingPhrases, REWRITTEN_PROMPT } from "./system-prompts.js";

const SYSTEMS = { none: undefined, conflicting: CONFLICTING_PROMPT, rewritten: REWRITTEN_PROMPT };
const SETS = { standard: CASES, harder: HARD_CASES, two: CASES.slice(0, 2) };

export async function run(params, emit) {
  const descriptions = params.get("descriptions") === "rich" ? RICH : VAGUE;
  const system = SYSTEMS[params.get("system") ?? "none"];
  const cases = SETS[params.get("set") ?? "standard"];
  if (!cases) throw new Error("unknown query set");

  const { tools } = await publishedTools(descriptions);
  emit({ type: "section", title: "What the model sees", text: "Published by the MCP server, not copied from a file." });
  for (const tool of tools) emit({ type: "card", title: tool.name, tone: "tool", text: tool.description });
  if (system) {
    const phrases = findToolBiasingPhrases(system);
    emit({
      type: "card", title: "System prompt", tone: phrases.length ? "warn" : "good",
      badge: phrases.length ? "biasing phrases" : "clean", text: system,
      ...(phrases.length ? { data: phrases } : {}),
    });
  }

  emit({ type: "section", title: "First tool chosen", text: "tool_choice auto. Tools are not executed." });
  const result = await measureRouting({
    tools,
    system,
    cases,
    onResult: (row) =>
      emit({
        type: "check",
        label: `${row.query} => ${row.tool ?? "no tool call"}`,
        pass: row.outcome === "correct",
        detail: `${row.outcome}, expected ${row.expected}${row.tool ? "" : `. Model said: ${row.text}`}`,
      }),
  });
  emit({
    type: "summary",
    items: [
      [`${result.correct}/${result.total}`, "correct"],
      [result.wrongTool, "wrong tool"],
      [result.noCall, "no call"],
      [result.inputTokens + result.outputTokens, "tokens"],
    ],
  });
}
