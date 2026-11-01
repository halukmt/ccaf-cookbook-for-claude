// A working MCP search against the built-in tools, on a copy of the fixture. One run with the sparse
// description and one with the enhanced one, on the fast model. The first part is free.

import { join } from "node:path";
import { CODEBASE_DIR, copyCodebase } from "../../_fixtures/codebase-answers.js";
import { check, finishChecks } from "../../_shared/check.js";
import { runPrompt } from "../../_shared/claude-cli.js";
import { createLab, serverPath } from "./mcp-lab.js";
import { DESCRIPTIONS, searchCodebase } from "./search-server.js";

const TOOL = "mcp__code__search_codebase";
const QUESTION = "Which function in this project takes money from a customer's card, and in which file? Reply with the function name and file only.";

const hits = searchCodebase(CODEBASE_DIR, "charge card customer");
console.log("Direct search:", hits.map((h) => `${h.file}:${h.line} score ${h.score}`));
// orders.js calls chargeCard, so it ties on score. That is real behaviour of a word search.
const target = hits.find((hit) => hit.file === "payments.js" && hit.text.includes("function chargeCard"));
check("The search really works: chargeCard has the top score", target?.score === hits[0]?.score && target.score >= 2);
check("It returns a line number and the whole function", target?.line === 6 && target.text.trim().endsWith("}"));
const sentences = DESCRIPTIONS.enhanced.split(/\.\s+|\.$/).filter(Boolean).length;
check("The enhanced description is 3 to 5 sentences", sentences >= 3 && sentences <= 5, `${sentences}`);
check("It states the alternative built-ins", DESCRIPTIONS.enhanced.includes("Grep") && DESCRIPTIONS.enhanced.includes("Glob"));

async function ask(variant) {
  const lab = createLab(`search-${variant}`);
  const src = join(lab.workspace.work, "src");
  copyCodebase(src);
  lab.writeProjectConfig({
    mcpServers: { code: { command: "node", args: [serverPath("search-server.js")], env: { CODEBASE_DIR: src.replace(/\\/g, "/"), DESCRIPTION: variant } } },
  });
  const run = await runPrompt(lab.workspace, QUESTION, { allowedTools: `Read,Grep,Glob,${TOOL}` });
  const names = run.toolCalls.map((t) => t.name.replace("mcp__code__", ""));
  const offered = run.requests[0]?.tools ?? [];
  const lengthOf = (name) => offered.find((t) => t.name === name)?.description?.length ?? 0;
  console.log(`\n${variant}: ${names.length} calls: ${names.join(" -> ") || "none"}`);
  console.log(`Answer: ${run.text}`);
  console.log(`Description lengths sent: ${TOOL} ${lengthOf(TOOL)}, Grep ${lengthOf("Grep")}.`);
  console.log(`Cost $${run.costUsd.toFixed(4)}, ${run.turns} turns, ${run.durationSeconds}s.`);
  return { variant, run, names, sentDescription: offered.find((t) => t.name === TOOL)?.description ?? null };
}

const sparse = await ask("sparse");
const enhanced = await ask("enhanced");
console.log(`\nTotal cost $${(sparse.run.costUsd + enhanced.run.costUsd).toFixed(4)}.`);

for (const r of [sparse, enhanced]) {
  check(`${r.variant}: run succeeded`, r.run.exitCode === 0 && !r.run.isError, r.run.stderr);
  check(`${r.variant}: the answer is right`, /chargeCard/.test(r.run.text) && /payments\.js/.test(r.run.text), r.run.text.slice(0, 120));
  check(`${r.variant}: the model really received this description`, r.sentDescription === DESCRIPTIONS[r.variant]);
  check(`${r.variant}: isolation held`, r.run.isolation.requests > 0 && !r.run.isolation.privateInstructionsSent);
}
check("Enhanced: the MCP tool was the first choice", enhanced.names[0] === "search_codebase", enhanced.names.join(" -> "));
finishChecks();
