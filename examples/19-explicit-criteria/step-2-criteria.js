// Step 2: categorical criteria instead of vague wording, on the same five snippets.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { CORE_SNIPPETS } from "../../_fixtures/review-snippets.js";
import { CRITERIA_PROMPT, rates, runPrompt, scoreRun, topSeverity } from "./review.js";

check("The prompt has a report section", /^Report:/m.test(CRITERIA_PROMPT));
check("The prompt has a skip section", /^Skip/m.test(CRITERIA_PROMPT));
check("The prompt has the comment rule", /contradicts what the code actually does/.test(CRITERIA_PROMPT));
check("The vague wording is gone", !/conservative|high-confidence/i.test(CRITERIA_PROMPT));

const store = resultStore(import.meta.url);
const rows = await store.runOnce("step-2-criteria", () => runPrompt(CRITERIA_PROMPT, CORE_SNIPPETS));
console.table(rows.map((row) => ({ snippet: row.id, got: topSeverity(row.findings), findings: row.findings.length })));
const counts = scoreRun(rows, CORE_SNIPPETS);
console.log("Counts:", counts, rates(counts));

check("All five snippets got a parsed answer", rows.length === 5);
check("The SQL injection is still reported", rows.find((row) => row.id === "sql-injection").findings.length > 0);
finishChecks();
