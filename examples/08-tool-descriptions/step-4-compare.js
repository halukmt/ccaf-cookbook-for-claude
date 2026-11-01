// Live: the same queries against the rewritten descriptions, compared with the saved baseline.
// Needs results/baseline.json from step-2-baseline.js. Step 3 is the RICH text in the server file.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { publishedTools, RICH } from "./customer-tools-server.js";
import { HARD_CASES, measureRouting, roughCost } from "./routing.js";

const baselineFile = new URL("./results/baseline.json", import.meta.url);
if (!existsSync(baselineFile)) throw new Error("Run step-2-baseline.js first.");
const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));

const { tools } = await publishedTools(RICH);
const run = await measureRouting({ tools });
const hard = await measureRouting({ tools, cases: HARD_CASES });
writeFileSync(new URL("./results/rich.json", import.meta.url), JSON.stringify({ run, hard }, null, 2));

function printTable(before, after) {
  console.log(`${"Query".padEnd(66)} ${"Expected".padEnd(13)} ${"Before".padEnd(13)} After`);
  after.rows.forEach((row, i) => {
    console.log(`${row.query.padEnd(66)} ${row.expected.padEnd(13)} ${(before.rows[i].tool ?? "(none)").padEnd(13)} ${row.tool ?? "(none)"}`);
  });
  console.log(`Accuracy: ${before.correct}/${before.total} -> ${after.correct}/${after.total}. Wrong tool: ${before.wrongTool} -> ${after.wrongTool}. No call: ${before.noCall} -> ${after.noCall}.\n`);
}

printTable(baseline.run, run);
printTable(baseline.hard, hard);
console.log(`About $${(roughCost(run) + roughCost(hard)).toFixed(4)}.`);

check("The same queries ran in the same order", run.rows.every((r, i) => r.query === baseline.run.rows[i].query));
check("The target holds: at least 9 of 10 correct", run.correct >= 9, `${run.correct}/10`);
check("No plain query was routed to the wrong tool", run.wrongTool === 0, `${run.wrongTool}`);
check("Accuracy on the 10 did not fall", run.correct >= baseline.run.correct, `${baseline.run.correct} -> ${run.correct}`);
check("Accuracy on the harder queries did not fall", hard.correct >= baseline.hard.correct, `${baseline.hard.correct} -> ${hard.correct}`);
finishChecks();
