// Adapter between the central server and the MCP configuration lab. Everything runs in a temp project
// and a temp config directory, with dummy values only.

import { join } from "node:path";
import { copyCodebase } from "../../_fixtures/codebase-answers.js";
import { runPrompt } from "../../_shared/claude-cli.js";
import { createLab, dummyHash, serverPath } from "./mcp-lab.js";

const entry = (label) => JSON.stringify({ type: "stdio", command: "node", args: [serverPath("scope-server.js")], env: { SERVER_LABEL: label, PROOF_FILE: "${PROOF_FILE}" } });

async function winner(lab) {
  lab.clearProofs();
  const got = await lab.mcp(["get", "team"]);
  return { scope: got.stdout.match(/Scope: (\w+)/)?.[1] ?? "?", label: lab.readProofs().at(-1)?.label ?? "?" };
}

// Free: no prompt is sent.
async function scopes(emit) {
  const lab = createLab("viewer-scopes");
  lab.writeProjectConfig();
  emit({ type: "section", title: "Same server name, several scopes", text: "The label comes from the server that really started." });

  const stages = [
    ["Project only", null, "project"],
    ["Added at user scope", ["--scope", "user", "team", entry("user-team")], "project"],
    ["Added at local scope", ["--scope", "local", "team", entry("local-team")], "local-team"],
  ];
  for (const [title, args, expected] of stages) {
    if (args) await lab.mcp(["add-json", ...args]);
    const result = await winner(lab);
    emit({ type: "check", label: `${title}: ${result.label} runs`, pass: result.label === expected, detail: `CLI says scope: ${result.scope}` });
  }

  emit({ type: "section", title: "Variable expansion", text: "The file holds ${CCAF_DEMO_TOKEN}. The server reports what it received, as a hash." });
  const fresh = createLab("viewer-expansion");
  fresh.writeProjectConfig();
  await fresh.mcp(["list"]);
  const set = fresh.readProofs().at(-1);
  emit({ type: "check", label: "Variable set: the server received the value", pass: set?.tokenSha256 === dummyHash });
  fresh.clearProofs();
  await fresh.mcp(["list"], { CCAF_DEMO_TOKEN: undefined });
  const unset = fresh.readProofs().at(-1);
  emit({ type: "card", title: "Variable unset", badge: "no warning", tone: "warn", text: "The CLI lists the server as connected, and the server receives the literal text as its token.", data: unset });
}

function report(emit, run, label) {
  for (const call of run.toolCalls) emit({ type: "tool", name: call.name, input: call.input, result: (call.resultText ?? "").slice(0, 400), isError: call.isError });
  emit({ type: "card", title: "Answer", tone: "good", text: run.text });
  emit({ type: "check", label: "Isolation held: private instructions were not sent", pass: run.isolation.requests > 0 && !run.isolation.privateInstructionsSent });
  emit({ type: "summary", items: [[label, "setup"], [run.toolCalls.length, "tool calls"], [`$${run.costUsd.toFixed(4)}`, "cost reported by the CLI"], [run.turns, "turns"]] });
}

const QUESTION = "Answer from the shop database's MCP server only: which table holds the loyalty tier, and which tables have a foreign key to orders? One sentence.";
const RESOURCE_ENVS = { none: {}, published: { WITH_RESOURCE: "1" }, hint: { WITH_RESOURCE: "1", RESOURCE_HINT: "1" } };

async function resource(emit, variant) {
  const env = RESOURCE_ENVS[variant];
  if (!env) throw new Error("unknown variant");
  const lab = createLab("viewer-resource");
  lab.writeProjectConfig({ mcpServers: { db: { command: "node", args: [serverPath("catalog-server.js")], env } } });
  emit({ type: "section", title: "Schema question", text: QUESTION });
  report(emit, await runPrompt(lab.workspace, QUESTION, { allowedTools: "mcp__db__list_tables,mcp__db__describe_table,ListMcpResourcesTool,ReadMcpResourceTool" }), variant);
}

async function description(emit, variant) {
  const lab = createLab("viewer-search");
  const src = join(lab.workspace.work, "src");
  copyCodebase(src);
  lab.writeProjectConfig({ mcpServers: { code: { command: "node", args: [serverPath("search-server.js")], env: { CODEBASE_DIR: src.replace(/\\/g, "/"), DESCRIPTION: variant } } } });
  const prompt = "Which function in this project takes money from a customer's card, and in which file? Reply with the function name and file only.";
  emit({ type: "section", title: "MCP search against Grep", text: prompt });
  report(emit, await runPrompt(lab.workspace, prompt, { allowedTools: "Read,Grep,Glob,mcp__code__search_codebase" }), variant);
}

export async function run(params, emit) {
  const mode = params.get("mode") ?? "scopes";
  if (mode === "scopes") return scopes(emit);
  if (mode === "resource-none") return resource(emit, "none");
  if (mode === "resource-published") return resource(emit, "published");
  if (mode === "resource-hint") return resource(emit, "hint");
  if (mode === "description-sparse") return description(emit, "sparse");
  if (mode === "description-enhanced") return description(emit, "enhanced");
  throw new Error("unknown mode");
}
