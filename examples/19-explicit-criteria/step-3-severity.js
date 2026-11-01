// Step 3: code patterns per severity level added to the criteria.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { CORE_SNIPPETS } from "../../_fixtures/review-snippets.js";
import { EXPLICIT_PROMPT, SEVERITY_EXAMPLES, rates, runPrompt, scoreRun, topSeverity } from "./review.js";

for (const level of ["critical", "major", "minor"]) {
  check(`Severity ${level} has a named pattern with code`, new RegExp(`^${level}, [^\\n]+:\\n  \\S`, "m").test(SEVERITY_EXAMPLES));
}

const store = resultStore(import.meta.url);
const rows = await store.runOnce("step-3-severity", () => runPrompt(EXPLICIT_PROMPT, CORE_SNIPPETS));
console.table(rows.map((row) => {
  const snippet = CORE_SNIPPETS.find((s) => s.id === row.id);
  return { snippet: row.id, expected: snippet.report ? snippet.severity : "skip", got: topSeverity(row.findings) };
}));
const counts = scoreRun(rows, CORE_SNIPPETS);
console.log("Counts:", counts, rates(counts));

check("All five snippets got a parsed answer", rows.length === 5);
check("The SQL injection is critical", topSeverity(rows.find((row) => row.id === "sql-injection").findings) === "critical");
finishChecks();
