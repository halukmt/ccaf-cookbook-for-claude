// Live: the 10 plain queries, then 4 harder ones, against the vague descriptions.
// Saved for the comparison in step 4.

import { mkdirSync, writeFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { publishedTools, VAGUE } from "./customer-tools-server.js";
import { CASES, formatRow, HARD_CASES, measureRouting, roughCost } from "./routing.js";

const { tools } = await publishedTools(VAGUE);
const log = (row) => console.log(formatRow(row));
const run = await measureRouting({ tools, onResult: log });
console.log("--- harder queries");
const hard = await measureRouting({ tools, cases: HARD_CASES, onResult: log });

mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(new URL("./results/baseline.json", import.meta.url), JSON.stringify({ run, hard }, null, 2));

console.log(`\nVague, 10 queries: ${run.correct} correct, ${run.wrongTool} wrong tool, ${run.noCall} no call.`);
console.log(`Vague, 4 harder: ${hard.correct} correct, ${hard.wrongTool} wrong tool, ${hard.noCall} no call.`);
console.log(`About $${(roughCost(run) + roughCost(hard)).toFixed(4)}.`);

check("All 10 queries got a real model response", run.rows.length === CASES.length && run.inputTokens > 0);
check("All 4 harder queries got a real model response", hard.rows.length === HARD_CASES.length && hard.inputTokens > 0);
check("Each row has a recorded outcome and stop reason", [...run.rows, ...hard.rows].every((r) => r.outcome && r.stopReason));
check("Counts add up", run.correct + run.wrongTool + run.noCall === 10 && hard.correct + hard.wrongTool + hard.noCall === 4);
finishChecks();
