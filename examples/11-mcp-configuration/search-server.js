// A working code search over the directory in CODEBASE_DIR. Only the description differs between runs:
// DESCRIPTION=sparse or DESCRIPTION=enhanced. Everything the enhanced text says is true of this code.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const DESCRIPTIONS = {
  sparse: "Searches code",
  enhanced:
    "Searches the project's JavaScript by whole function, ranked by how many of your words each function contains in its name or body. " +
    "Returns JSON with file, line, score and the full function text, so no follow-up Read is needed. " +
    "Use it first when you know what code does but not what it is called, such as 'charge a customer card'; several words find a function " +
    "even when they are not next to each other, which a single Grep pattern cannot do. " +
    "Use Grep instead for an exact string or regex, and Glob for file names. It matches words, so it is not semantic and has no synonyms.",
};

function functionsIn(file, source) {
  const lines = source.split(/\r?\n/);
  const found = [];
  lines.forEach((line, index) => {
    if (!/^(export\s+)?(async\s+)?function\s+\w+|^router\.\w+\(/.test(line)) return;
    let end = index;
    while (end < lines.length - 1 && !/^(\}|\}\);)\s*$/.test(lines[end])) end++;
    found.push({ file, line: index + 1, text: lines.slice(index, end + 1).join("\n") });
  });
  return found;
}

export function searchCodebase(dir, query) {
  const words = query.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
  const all = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .flatMap((name) => functionsIn(name, readFileSync(join(dir, name), "utf8")));
  return all
    .map((fn) => ({ ...fn, score: words.filter((word) => fn.text.toLowerCase().includes(word)).length }))
    .filter((fn) => fn.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

if (process.env.CODEBASE_DIR) {
  const server = new McpServer({ name: "code-search", version: "1.0.0" });
  server.registerTool(
    "search_codebase",
    {
      description: DESCRIPTIONS[process.env.DESCRIPTION] ?? DESCRIPTIONS.sparse,
      inputSchema: { query: z.string().describe("Words describing the code you are looking for") },
    },
    async ({ query }) => ({ content: [{ type: "text", text: JSON.stringify(searchCodebase(process.env.CODEBASE_DIR, query)) }] })
  );
  await server.connect(new StdioServerTransport());
}
