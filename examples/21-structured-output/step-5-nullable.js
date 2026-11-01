// Step 5: three complete and two incomplete documents, nullable schema against all-required.
// Scored against the answer key. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { getDocument, scoreExtraction, tallyOutcomes } from "../../_fixtures/documents-answers.js";
import { OPTIONAL_FIELDS, SCORED_FIELDS, allRequiredTool, callEach, extractTool, sumUsage, validateInput } from "./tools.js";

const COMPLETE = ["d01", "d02", "d10"];
const INCOMPLETE = ["d13", "d03"];
const IDS = [...COMPLETE, ...INCOMPLETE];
const forced = { type: "tool", name: "extract_document" };

const store = resultStore(import.meta.url);
const nullableRows = await store.runOnce("nullable", () => callEach(IDS, { tools: [extractTool], toolChoice: forced }));
const requiredRows = await store.runOnce("all-required", () => callEach(IDS, { tools: [allRequiredTool], toolChoice: forced }));

const score = (rows, fields = SCORED_FIELDS) => rows.map((r) => ({ id: r.docId, input: r.input, outcomes: scoreExtraction(getDocument(r.docId), r.input, fields) }));
const fieldsTable = (rows) => score(rows).map((s) => ({ doc: s.id, ...Object.fromEntries(SCORED_FIELDS.map((f) => [f, `${s.outcomes[f]}: ${String(s.input[f]).slice(0, 18)}`])) }));

console.log("Nullable schema:");
console.table(fieldsTable(nullableRows));
console.log("All fields required:");
console.table(fieldsTable(requiredRows));

const tally = (rows) => tallyOutcomes(score(rows).map((s) => s.outcomes));
const a = tally(nullableRows);
const b = tally(requiredRows);
console.log(`Nullable:     correct ${a.correct + a.correct_null} of ${a.fields}, invented ${a.fabricated} of ${a.absent} absent fields.`);
console.log(`All required: correct ${b.correct + b.correct_null} of ${b.fields}, invented ${b.fabricated} of ${b.absent} absent fields.`);
console.log(`About ${usd(estimateCost(FORCED_TOOL_MODEL, sumUsage([...nullableRows, ...requiredRows])))} at list price.`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectations going in, against this run:");
console.log(`  Nullable returns null for absent fields    ${yesNo(a.fabricated === 0)}`);
console.log(`  The all-required version invents values    ${yesNo(b.fabricated > 0)}`);

const complete = score(nullableRows).filter((s) => COMPLETE.includes(s.id));
check("Scoring can say no: an invented value is counted", scoreExtraction(getDocument("d13"), { tax_id: "DE1" }, ["tax_id"]).tax_id === "fabricated");
check("All answers fit their schema", nullableRows.every((r) => validateInput(extractTool.input_schema, r.input).length === 0));
check("The complete documents have all optional fields right", complete.every((s) => OPTIONAL_FIELDS.every((f) => s.outcomes[f] === "correct")));
check("No optional field was invented on the incomplete documents, with nullable types", score(nullableRows).filter((s) => INCOMPLETE.includes(s.id)).every((s) => OPTIONAL_FIELDS.every((f) => s.outcomes[f] !== "fabricated")));
check("The incomplete documents have some absent fields to test", a.absent > 0);
finishChecks();
