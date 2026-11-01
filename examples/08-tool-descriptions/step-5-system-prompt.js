// Live: rich descriptions plus a system prompt that competes with them, then a rewritten prompt.
// Needs results/rich.json from step-4-compare.js for the no-prompt comparison.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { publishedTools, RICH } from "./customer-tools-server.js";
import { formatRow, measureRouting, roughCost } from "./routing.js";
import { CONFLICTING_PROMPT, findToolBiasingPhrases, REWRITTEN_PROMPT } from "./system-prompts.js";

const richFile = new URL("./results/rich.json", import.meta.url);
if (!existsSync(richFile)) throw new Error("Run step-4-compare.js first.");
const noPrompt = JSON.parse(readFileSync(richFile, "utf8")).run;

const conflictPhrases = findToolBiasingPhrases(CONFLICTING_PROMPT);
const rewrittenPhrases = findToolBiasingPhrases(REWRITTEN_PROMPT);
console.log("Phrases in the conflicting prompt:", conflictPhrases);
console.log("Phrases in the rewritten prompt:", rewrittenPhrases);

const { tools } = await publishedTools(RICH);
const log = (row) => console.log(formatRow(row));

console.log(`\n--- "${CONFLICTING_PROMPT}"`);
const conflicting = await measureRouting({ tools, system: CONFLICTING_PROMPT, onResult: log });
console.log(`\n--- "${REWRITTEN_PROMPT}"`);
const rewritten = await measureRouting({ tools, system: REWRITTEN_PROMPT, onResult: log });

writeFileSync(new URL("./results/system-prompts.json", import.meta.url), JSON.stringify({ conflicting, rewritten }, null, 2));

const line = (label, r) => console.log(`${label.padEnd(20)} ${r.correct}/${r.total} correct, ${r.wrongTool} wrong tool, ${r.noCall} no call`);
console.log("");
line("No system prompt", noPrompt);
line("Conflicting prompt", conflicting);
line("Rewritten prompt", rewritten);
const firstOrder = conflicting.rows[0];
console.log(`\nFirst query under the conflicting prompt: "${firstOrder.query}" -> ${firstOrder.tool} (all tools in that turn: ${firstOrder.allTools.join(", ") || "none"})`);
const alsoExpected = conflicting.rows.filter((r) => r.outcome === "wrong tool" && r.allTools.includes(r.expected)).length;
console.log(`Wrong-tool rows that also called the expected tool in the same turn: ${alsoExpected} of ${conflicting.wrongTool}.`);
console.log(`About $${(roughCost(conflicting) + roughCost(rewritten)).toFixed(4)}.`);

check("The scan finds the biasing phrase in the conflicting prompt", conflictPhrases.length > 0, conflictPhrases.join("; "));
check("The rewritten prompt has no biasing phrase", rewrittenPhrases.length === 0);
check("Both prompts really ran on all 10 queries", conflicting.total === 10 && rewritten.total === 10 && conflicting.inputTokens > 0);
check("The conflicting prompt really changed routing", conflicting.correct < noPrompt.correct, `${noPrompt.correct} -> ${conflicting.correct}`);
check("The rewritten prompt is not worse than no prompt", rewritten.correct >= noPrompt.correct, `${noPrompt.correct} vs ${rewritten.correct}`);
check("The rewritten prompt is not worse than the conflicting one", rewritten.correct >= conflicting.correct, `${conflicting.correct} vs ${rewritten.correct}`);
finishChecks();
