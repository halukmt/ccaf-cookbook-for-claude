// Live, on the fast model: the real CLI with a project server and a user server at the same time.
// Shows that a model session can call both, and that the expanded value really reached them.

import { check, finishChecks } from "../../_shared/check.js";
import { runPrompt } from "../../_shared/claude-cli.js";
import { createLab, DUMMY_TOKEN, dummyHash, serverPath } from "./mcp-lab.js";

const lab = createLab("both-scopes");
lab.writeProjectConfig();
await lab.mcp(["add-json", "--scope", "user", "personal", JSON.stringify({
  type: "stdio", command: "node", args: [serverPath("scope-server.js")],
  env: { CCAF_DEMO_TOKEN: "${CCAF_DEMO_TOKEN}", SERVER_LABEL: "user", PROOF_FILE: "${PROOF_FILE}" },
})]);

const run = await runPrompt(lab.workspace, "Call server_status on every MCP server you have, then report each label and hash.", {
  allowedTools: "mcp__team__server_status,mcp__personal__server_status",
  env: lab.baseEnv,
});

const statuses = run.init?.mcp_servers ?? [];
console.log("Servers at session start:", statuses);
console.log("Tool calls:", run.toolCalls.map((t) => `${t.name}${t.isError ? " (error)" : ""}`));
console.log("Answer:", run.text);
console.log(`Cost $${run.costUsd.toFixed(4)}, ${run.turns} turns, ${run.durationSeconds}s, ${run.isolation.requests} requests.`);

const sentTools = run.requests.at(-1)?.tools ?? [];
const mcpTools = sentTools.filter((t) => t.name.startsWith("mcp__"));
console.log("MCP tools in the last request:", mcpTools.map((t) => `${t.name}${t.defer_loading ? " (deferred)" : ""}`));

check("The run succeeded", run.exitCode === 0 && !run.isError, run.stderr);
check("Both servers connected at session start", ["team", "personal"].every((name) => statuses.some((s) => s.name === name && s.status === "connected")));
check("No other MCP server was loaded", statuses.length === 2, statuses.map((s) => s.name).join(", "));
check("Tools from both scopes really ran", ["team", "personal"].every((name) => run.toolCalls.some((t) => t.name === `mcp__${name}__server_status` && !t.isError && t.resultText)));
const results = run.toolCalls.map((t) => JSON.parse(t.resultText));
check("Each server reported its own label", results.some((r) => r.label === "project") && results.some((r) => r.label === "user"));
check("Each server received the expanded value", results.every((r) => r.tokenSha256 === dummyHash));
check("The dummy value itself never went to the API", !JSON.stringify(run.requests).includes(DUMMY_TOKEN));
check("The answer reports both labels", /project/i.test(run.text) && /user/i.test(run.text));
check("Isolation held: private instructions were not sent", run.isolation.requests > 0 && !run.isolation.privateInstructionsSent);

finishChecks();
