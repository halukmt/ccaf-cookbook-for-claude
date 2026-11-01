// The review passes and the measurements on them. Every pass uses the same review brief, so a
// difference in results comes from how the work is split and not from the wording.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { client, MODEL } from "../../_shared/client.js";

const BRIEF = "Look for bugs, style problems and security flaws. Cite the specific line for every issue.";

const FORMAT =
  "Output only JSON Lines, one object per issue and no other text and no code fences: " +
  '{"file":"<name>","line":<number>,"severity":"critical|high|medium|low","description":"<one sentence>"}. ' +
  "Output nothing for a file with no issues.";

const CROSS_FORMAT =
  "Output only JSON Lines, one object per issue and no other text and no code fences: " +
  '{"files":["<name>","<name>"],"severity":"critical|high|medium|low","description":"<one sentence>"}. ' +
  "Report only issues that involve more than one file.";

export function loadCodebase(dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".ts") || f.endsWith(".js")).sort();
  return new Map(files.map((file) => [file, readFileSync(join(dirPath, file), "utf8")]));
}

// Models miscount lines in raw text, so every pass gets numbered source.
const numbered = (content) => content.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");

// One line per object, so a response cut off at max_tokens loses only its last, broken line.
export function parseJsonLines(text) {
  const items = [];
  let broken = 0;
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("```")) continue;
    try {
      items.push(JSON.parse(line));
    } catch {
      broken++;
    }
  }
  return { items, broken };
}

async function ask(content, maxTokens) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return {
    ...parseJsonLines(text),
    text,
    stopReason: response.stop_reason,
    usage: response.usage,
    blockTypes: [...new Set(response.content.map((b) => b.type))],
  };
}

export async function singlePassReview(codebase, { maxTokens = 4096 } = {}) {
  const allCode = [...codebase].map(([name, content]) => `=== ${name} ===\n${numbered(content)}`).join("\n\n");
  const reply = await ask(`${BRIEF} Review all files.\n${FORMAT}\n\n${allCode}`, maxTokens);
  return {
    issues: reply.items,
    stopReason: reply.stopReason,
    brokenLines: reply.broken,
    usage: { input_tokens: reply.usage.input_tokens, output_tokens: reply.usage.output_tokens },
  };
}

export async function perFileReview(codebase, { maxTokens = 2048, onFile = () => {} } = {}) {
  const reviews = [];
  for (const [name, content] of codebase) {
    const reply = await ask(`${BRIEF} Review this file.\n${FORMAT}\n\n=== ${name} ===\n${numbered(content)}`, maxTokens);
    const review = {
      fileName: name,
      issues: reply.items.map((issue) => ({ ...issue, file: name })),
      bugCount: reply.items.length,
      stopReason: reply.stopReason,
      brokenLines: reply.broken,
      usage: { input_tokens: reply.usage.input_tokens, output_tokens: reply.usage.output_tokens },
    };
    reviews.push(review);
    onFile(review);
  }
  return reviews;
}

export function extractImportGraph(codebase) {
  const graph = {};
  for (const [name, content] of codebase) {
    graph[name] = [...content.matchAll(/from\s+"\.\/([^"]+)"/g)].map((match) => match[1]);
  }
  return graph;
}

// Comments directly above each export, the export line, and each line that uses an imported name:
// the promises a module makes and how its callers read them. Extracted by code, not by the model.
export function extractContracts(codebase) {
  const out = [];
  for (const [name, content] of codebase) {
    const lines = content.split("\n");
    const contract = [];
    lines.forEach((line, i) => {
      if (!/^export /.test(line)) return;
      const comments = [];
      for (let j = i - 1; j >= 0 && lines[j].trim().startsWith("//"); j--) comments.unshift(lines[j]);
      contract.push(...comments, line);
      if (/^export const \w+ = \{$/.test(line)) {
        for (let j = i + 1; j < lines.length && !lines[j].startsWith("}"); j++) contract.push(lines[j]);
      }
    });

    const imported = [...content.matchAll(/import\s+\{([^}]+)\}\s+from\s+"\.\//g)]
      .flatMap((match) => match[1].split(",").map((s) => s.trim()));
    const uses = lines.filter(
      (line) => !line.startsWith("import ") && imported.some((id) => new RegExp(`\\b${id}\\b`).test(line))
    );
    out.push(`=== ${name} ===\nExports:\n${contract.join("\n") || "(none)"}\nUses of imports:\n${uses.join("\n") || "(none)"}`);
  }
  return out.join("\n\n");
}

// "summaries" is the base input: per-file summaries and the import graph. "contracts" adds the extracted interfaces.
export async function crossFilePass(codebase, reviews, { mode = "summaries", maxTokens = 4096 } = {}) {
  const describe = ({ fileName, bugCount, issues }) =>
    [`${fileName}: ${bugCount} issues`, issues.map(({ description }) => description).join("; ")].join(" - ");
  const summary = reviews.map(describe).join("\n");
  const imports = extractImportGraph(codebase);
  const contracts = mode === "contracts" ? `\n\nInterfaces and call sites:\n${extractContracts(codebase)}` : "";

  const reply = await ask(
    "Review how these files work together. Look for:\n1. Problems with data passed between modules\n" +
      "2. APIs used inconsistently from file to file\n3. One pattern treated differently in different files\n" +
      `${CROSS_FORMAT}\n\nSummary of each file:\n${summary}\n\nImports by file:\n${JSON.stringify(imports)}${contracts}`,
    maxTokens
  );
  return {
    mode,
    issues: reply.items,
    blockTypes: reply.blockTypes,
    stopReason: reply.stopReason,
    brokenLines: reply.broken,
    usage: { input_tokens: reply.usage.input_tokens, output_tokens: reply.usage.output_tokens },
  };
}

export function stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

// Slope of a straight line through (file position, value): below zero means later files get less.
export function positionSlope(values) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const top = values.reduce((sum, y, x) => sum + (x - meanX) * (y - meanY), 0);
  const bottom = values.reduce((sum, _, x) => sum + (x - meanX) ** 2, 0);
  return bottom === 0 ? 0 : top / bottom;
}

// Sonnet list price, as an estimate only: this API response reports tokens, not money.
export function estimateUsd(usages, inPerMillion = 3, outPerMillion = 15) {
  const total = usages.reduce(
    (sum, u) => ({ input: sum.input + u.input_tokens, output: sum.output + u.output_tokens }),
    { input: 0, output: 0 }
  );
  return { ...total, usd: (total.input * inPerMillion + total.output * outPerMillion) / 1e6 };
}
