// Compares the saved sessions. No model, no cost. Common expectations are printed next to what really happened.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { CHANGED_FILES } from "./session-lab.js";
import { sessionChecks } from "./verify-sessions.js";
import { buildComparison } from "./comparison.js";

const dir = dirname(fileURLToPath(import.meta.url));
const lab = JSON.parse(readFileSync(resolve(dir, "results", "sessions.json"), "utf8"));
const comparison = buildComparison(lab);

console.table(comparison.table);
for (const [label, run] of [["Resume, neutral", lab.resumeNeutral], ["Resume, state question", lab.resumeState], ["Fresh", lab.fresh]]) {
  console.log(`\n===== ${label} =====\n${run.text.slice(0, 900)}\n[...]`);
}

console.log("\nCommon expectations, against this run:");
for (const [text, held] of comparison.predictions) console.log(`  ${text.padEnd(62)} ${held ? "HELD" : "DID NOT HOLD"}`);

for (const [label, pass, detail] of sessionChecks(lab)) check(label, pass, detail);
check("All three runs are compared", comparison.table.length >= 8);
check("The fresh session read only the changed files", lab.fresh.filesRead.every((f) => CHANGED_FILES.includes(f)), lab.fresh.filesRead.join(", "));
check("Each answer flags the remaining MD5 problem", lab.resumeNeutral.assessment.flagsMd5 && lab.resumeState.assessment.flagsMd5 && lab.fresh.assessment.flagsMd5);
check("The fresh session recognises the SQL fix", lab.fresh.assessment.saysSqlFixed);
check("The fresh session does not disown the earlier findings", !lab.fresh.assessment.disownsEarlierFindings);

finishChecks();
