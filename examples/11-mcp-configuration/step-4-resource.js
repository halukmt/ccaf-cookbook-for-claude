// The catalogue as an MCP resource. First free checks with a plain MCP client, then one real CLI run
// with the resource and one without. Live on the fast model.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { check, finishChecks } from "../../_shared/check.js";
import { runPrompt } from "../../_shared/claude-cli.js";
import { SHOP_SCHEMA } from "../../_fixtures/shop-schema.js";
import { createLab, serverPath } from "./mcp-lab.js";

const URI = "db://schema/main";
const server = serverPath("catalog-server.js");

const transport = new StdioClientTransport({ command: "node", args: [server], env: { ...process.env, WITH_RESOURCE: "1" } });
const client = new Client({ name: "resource-check", version: "1.0.0" });
await client.connect(transport);
const { resources } = await client.listResources();
console.log(resources);
check("The resource is published with name, description and mimeType", resources.length === 1 && resources[0].uri === URI && resources[0].name === "db-schema" && Boolean(resources[0].description) && resources[0].mimeType === "application/json");
const read = await client.readResource({ uri: URI });
check("Reading it returns the whole catalogue", JSON.parse(read.contents[0].text).tables.length === SHOP_SCHEMA.tables.length);
await client.close();

const QUESTION = "Answer from the shop database's MCP server only: which table holds the loyalty tier, and which tables have a foreign key to orders? One sentence.";
const TOOLS = "mcp__db__list_tables,mcp__db__describe_table,ListMcpResourcesTool,ReadMcpResourceTool";

async function ask(label, { env, prompt = QUESTION }) {
  const lab = createLab(label);
  lab.writeProjectConfig({ mcpServers: { db: { command: "node", args: [server], env } } });
  const run = await runPrompt(lab.workspace, prompt, { allowedTools: TOOLS });
  const names = run.toolCalls.map((t) => t.name.replace("mcp__db__", ""));
  console.log(`\n${label}: ${names.length} calls: ${names.join(" -> ") || "none"}`);
  console.log(`Answer: ${run.text}`);
  console.log(`Cost $${run.costUsd.toFixed(4)}, ${run.turns} turns, ${run.durationSeconds}s.`);
  const first = run.requests[0] ?? {};
  return {
    label,
    run,
    names,
    offered: (first.tools ?? []).map((t) => t.name),
    catalogueInFirstRequest: (JSON.stringify(first.system ?? "") + JSON.stringify(first.messages ?? "")).includes("loyalty_tier"),
  };
}

const answerIsRight = (text) => /customers/.test(text) && /order_items/.test(text) && /refunds/.test(text);
const RESOURCE = { WITH_RESOURCE: "1" };

const without = await ask("no-resource", { env: {} });
const published = await ask("resource-published", { env: RESOURCE });
const hinted = await ask("resource-and-hint", { env: { ...RESOURCE, RESOURCE_HINT: "1" } });
const mentioned = await ask("resource-mentioned", { env: RESOURCE, prompt: `@db:${URI}\n\n${QUESTION}` });
const runs = [without, published, hinted, mentioned];

console.log("\nResource tools offered to the model:", published.offered.filter((n) => /Resource/.test(n)));
console.log("Calls:", runs.map((r) => `${r.label} ${r.names.length}`).join(", "));
console.log("Catalogue in first request:", runs.map((r) => `${r.label} ${r.catalogueInFirstRequest}`).join(", "));
console.log(`Total cost $${runs.reduce((sum, r) => sum + r.run.costUsd, 0).toFixed(4)}.`);

for (const r of runs) {
  check(`${r.label}: run succeeded`, r.run.exitCode === 0 && !r.run.isError, r.run.stderr);
  check(`${r.label}: answer is right`, answerIsRight(r.run.text), r.run.text.slice(0, 160));
  check(`${r.label}: isolation held`, r.run.isolation.requests > 0 && !r.run.isolation.privateInstructionsSent);
}
check("No resource: the model explored with tools", without.names.includes("list_tables") && without.names.includes("describe_table"));
check("Publishing alone does not put the catalogue in the first request", !published.catalogueInFirstRequest);
check("The CLI offers the model a tool for reading resources", published.offered.includes("ReadMcpResourceTool"));
check("Hint: the model read the resource", hinted.names.includes("ReadMcpResourceTool"));
check("Hint: fewer calls than exploring", hinted.names.length < without.names.length, `${without.names.length} -> ${hinted.names.length}`);
// In -p mode the @ mention is not expanded, so what the model does with it varies. Earlier runs of this
// script gave 2 calls and 9 calls, so only the part that does not depend on the model is checked.
const firstMessage = JSON.stringify(mentioned.run.requests[0]?.messages ?? "");
check("Mention in -p mode: the catalogue is not in the first request", !mentioned.catalogueInFirstRequest);
check("Mention in -p mode: it arrives as plain text", firstMessage.includes(`@db:${URI}`));

finishChecks();
