// Step 2: which fields fail on which document structure. Reads the saved baseline, no cost.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { TEST_DOCS, failureLog, failures, formatProblems, measure } from "./extract.js";

const runs = resultStore(import.meta.url).load("baseline");

console.log("Outcome counts per field and structure, over three runs:");
console.table(failureLog(runs));

const log = failures(runs);
const dataFailures = log.filter((f) => f.field !== "format");
console.log("Data failures:");
console.table(dataFailures);

const formats = {};
for (const row of runs.flat()) for (const p of formatProblems(row)) formats[p] = (formats[p] ?? 0) + 1;
console.log("Format problems, over 30 answers:", formats);

const m = measure(runs);
const fabricatedDocs = [...new Set(dataFailures.filter((f) => f.outcome === "fabricated").map((f) => f.doc))];
console.log("\nThe three triggers, in this baseline:");
console.log(`  Inconsistent formatting:             ${30 - m.wellFormed} of 30 answers not bare JSON`);
console.log(`  Judgement calls differing by run:    ${TEST_DOCS.length - m.stableDocs} of ${TEST_DOCS.length} documents`);
console.log(`  Empty fields where data exists:      ${m.tally.empty} of ${m.tally.present} fields`);
console.log(`  Invented values where data is absent: ${m.tally.fabricated} of ${m.tally.absent} fields (${fabricatedDocs.join(", ") || "none"})`);

check("Every document type appears in the log", failureLog(runs).length === 3);
check("The log accounts for all scored fields", m.tally.fields === 120);
check("Scoring can say no: a wrong total is reported", failures([[{ id: "d01", bare: true, output: { vendor_name: "Northwind", document_date: "2024-03-15", total_amount: 1, line_items: [] }, usage: {} }]], TEST_DOCS).some((f) => f.field === "total_amount" && f.outcome === "wrong"));
finishChecks();
