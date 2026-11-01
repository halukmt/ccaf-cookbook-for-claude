// A temporary copy of the fixture, the read tools an explorer gets, and the ground truth computed from its files.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { copyCodebase, loadCodebase } from "../../_fixtures/codebase-answers.js";
import { makeTempDir } from "../../_shared/agent-env.js";

export function createWorkspace() {
  const root = makeTempDir("explore");
  const code = join(root, "code");
  copyCodebase(code);
  return { root, code };
}

export const READ_TOOLS = [
  { name: "list_files", description: "List the files of the codebase.", input_schema: { type: "object", properties: {} } },
  {
    name: "read_file", description: "Read one file of the codebase.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "search_code", description: "Find lines containing some text, across every file.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];

// Read tools confined to one directory. `filesRead` records each read, in order, repeats included.
export function readToolHandler(code, filesRead = []) {
  const safePath = (path) => {
    const full = resolve(code, path);
    if (!full.startsWith(resolve(code) + sep)) throw new Error(`Path outside the codebase: ${path}`);
    return full;
  };
  return (name, input) => {
    if (name === "list_files") return readdirSync(code).sort().join("\n");
    if (name === "read_file") {
      const full = safePath(input.path);
      if (!existsSync(full)) return { content: `No such file: ${input.path}`, isError: true };
      filesRead.push(basename(full));
      return readFileSync(full, "utf8");
    }
    if (name === "search_code") {
      const hits = [];
      for (const file of readdirSync(code).sort()) {
        readFileSync(join(code, file), "utf8").split("\n").forEach((line, index) => {
          if (line.includes(input.text)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
        });
      }
      return hits.join("\n") || "No matches.";
    }
    throw new Error(`Unknown tool: ${name}`);
  };
}

// Ground truth, computed from the fixture and not from any model output.
export function exportsByFile() {
  const truth = new Map();
  for (const [file, source] of loadCodebase()) {
    truth.set(file, [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((match) => match[1]));
  }
  return truth;
}

export const realFiles = () => new Set(loadCodebase().keys());

// A half-written manifest after a crash would be worse than an old one, so writes go through a rename.
export function writeAtomic(path, text) {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}
