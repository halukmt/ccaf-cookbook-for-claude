// Live: the whole sequence from the first analysis to the fresh session, with the real CLI.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { runSessionLab, totalCost } from "./pipeline.js";
import { sessionChecks } from "./verify-sessions.js";

const lab = await runSessionLab({ onStage: (stage) => console.log(`\n--- ${stage}`) });

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "sessions.json"), JSON.stringify(lab, null, 2));

const line = (label, run) => console.log(`${label}: session ${run.sessionId}, reads [${run.filesRead}], ${run.turns} turns, $${run.costUsd.toFixed(4)}, ${run.durationSeconds}s`);
line("Initial", lab.initial);
line("Forked resume, neutral", lab.resumeNeutral);
line("Forked resume, state question", lab.resumeState);
line("Fresh", lab.fresh);
console.log(`Tool results stored in the transcript: ${lab.toolResultsStored}`);
console.log(`Summary:\n${lab.summary.markdown}`);
console.log(`\nTotal CLI cost: $${totalCost(lab).toFixed(4)}`);

for (const [label, pass, detail] of sessionChecks(lab)) check(label, pass, detail);
finishChecks();
