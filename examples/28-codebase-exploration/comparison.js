// One long exploration conversation per arm, then a question from memory. Four arms crossing two choices:
// scratchpad or not, and whether old tool calls stay in the history. Dropping them is forced: it stands in for what
// compaction does to a long session, because twelve small files never fill a context window by themselves.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAST_MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";
import { addUsage } from "../../_shared/pricing.js";
import { formatFindings, readScratchpad, updateScratchpad } from "./explorer.js";
import { createWorkspace, exportsByFile, READ_TOOLS, readToolHandler } from "./workspace.js";

const SYSTEM = "You are exploring a codebase, module by module, for a later architecture review. Use your tools. Reply to each request in one short sentence.";

const PAD_RULE = " Maintain the scratchpad from the start: after each module, call update_scratchpad with the file path and each exported function.";

const PAD_TOOL = {
  name: "update_scratchpad",
  description: "Add to your scratchpad file, which you are shown again before each step.",
  input_schema: {
    type: "object",
    properties: {
      module: { type: "string" },
      filePaths: { type: "array", items: { type: "string" } },
      functions: { type: "array", items: { type: "string" } },
      dependencyChain: { type: "array", items: { type: "string" } },
      criticalNote: { type: "string" },
      summary: { type: "string" },
    },
    required: ["module", "filePaths", "functions"],
  },
};

export const FINAL_QUESTION = "List every exported function and constant you discovered, with its file path. One line per file, in the form `file.js: name, name`. " +
  "Use only what you still have. If you no longer have a module's details, say so for that module, and do not guess.";

export const MODULES = [...exportsByFile().keys()];

// Keeps only the text of old turns. Tool calls and their results disappear, as they would after compaction.
function dropToolHistory(messages) {
  return messages.flatMap((message) => {
    if (typeof message.content === "string") return [message];
    const text = message.content.filter((block) => block.type === "text");
    return text.length ? [{ role: message.role, content: text }] : [];
  });
}

const PAD_END = "## End of scratchpad";
const withoutOldPad = (message) => {
  if (typeof message.content !== "string" || !message.content.includes(PAD_END)) return message;
  return { ...message, content: message.content.split(`${PAD_END}\n`).at(-1) };
};

// `dropOld` runs between modules, so the current module's own tool calls stay intact while it is explored.
export async function exploreModules(modules, { useScratchpad, dropOld, onEvent }) {
  const { root, code } = createWorkspace();
  const padPath = join(root, "exploration-scratchpad.md");
  writeFileSync(padPath, "");
  const filesRead = [];
  const read = readToolHandler(code, filesRead);
  let finished = false;
  let lateReads = 0;
  const usage = {};
  const perTurnInput = [];
  let messages = [];

  const handleTool = (name, input) => {
    if (name === "update_scratchpad") {
      updateScratchpad(padPath, { filePaths: [], functions: [], dependencyChain: [], criticalNote: "None", summary: "-", ...input });
      return "Saved.";
    }
    if (finished) {
      lateReads++;
      return { content: "Exploration is over. Answer from what you already have.", isError: true };
    }
    return read(name, input);
  };

  const turn = async (text) => {
    const pad = useScratchpad ? readScratchpad(padPath) : "";
    const content = useScratchpad ? `## Your scratchpad\n${pad || "(empty)"}\n${PAD_END}\n${text}` : text;
    // Only the newest copy stays. Keeping every copy cost 651,505 input tokens against 368,690 for this version.
    messages = messages.map(withoutOldPad);
    messages.push({ role: "user", content });
    const result = await runToolLoop({
      messages, model: FAST_MODEL, system: SYSTEM + (useScratchpad ? PAD_RULE : ""), maxTokens: 4000, maxIterations: 10,
      tools: [...READ_TOOLS, ...(useScratchpad ? [PAD_TOOL] : [])], handleTool, onEvent,
    });
    if (result.stopReason !== "end_turn") throw new Error(`Turn ended with ${result.stopReason}`);
    addUsage(usage, result.usage);
    perTurnInput.push(result.usage.input_tokens);
    messages = result.messages;
    return result.finalText;
  };

  for (const file of modules) {
    await turn(`Explore the module ${file}.`);
    if (dropOld) messages = dropToolHistory(messages);
  }
  finished = true;
  const answer = await turn(FINAL_QUESTION);
  return { answer, usage, perTurnInput, filesRead, lateReads, scratchpad: readScratchpad(padPath) };
}

// Looks for `.js` names, because this fixture has no `.ts` files and a search for those would always give 0.
export function measureSpecificity(answerText) {
  const named = (answerText.match(/\b[\w-]+\.js\b/g) ?? []).length;
  const generic = (answerText.match(/typical|standard|common pattern/gi) ?? []).length;
  return { specificRefs: named, genericRefs: generic, ratio: named / (generic + 1) };
}

// Scores against the real exports. A name under the wrong file counts as wrong.
export function scorePairs(answer, modules = MODULES) {
  const truth = exportsByFile();
  const expected = modules.flatMap((file) => truth.get(file).map((name) => `${file}:${name}`));
  const claimed = new Set();
  for (const line of answer.split("\n")) {
    // Only lines in the requested form: a file name, then a colon. Prose around them claims nothing.
    const match = line.match(/^[\s*`-]*([\w-]+\.js)[`*\s]*:\s*(.*)$/);
    if (!match) continue;
    if (/\b(none|not read|no longer|retained|unknown)\b/i.test(match[2])) continue;
    // A comma-separated item of more than one word is prose about the module, not a claimed name.
    for (const item of match[2].replace(/\([^)]*\)/g, "").split(",")) {
      const name = item.trim().replace(/[`*.]/g, "");
      if (/^[A-Za-z_]\w*$/.test(name)) claimed.add(`${match[1]}:${name}`);
    }
  }
  const correct = expected.filter((pair) => claimed.has(pair));
  const wrong = [...claimed].filter((pair) => !expected.includes(pair));
  return { expected: expected.length, correct: correct.length, recall: correct.length / expected.length, missing: expected.filter((pair) => !claimed.has(pair)), wrong };
}

export { formatFindings };
