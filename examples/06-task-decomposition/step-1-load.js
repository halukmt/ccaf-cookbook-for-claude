// Loads the codebase and checks the fixture against its answer key. No model.

import { check, finishChecks } from "../../_shared/check.js";
import { CLEAN_FILES, CODEBASE_DIR, DEFECTS, defectFiles, defectLine, defectsMatchedBy, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { extractContracts, extractImportGraph, loadCodebase, parseJsonLines } from "./review.js";

const codebase = loadCodebase(CODEBASE_DIR);
console.log(`Review set: ${codebase.size} files`);
console.table(DEFECTS.map((d) => ({ id: d.id, scope: d.scope, file: d.file, line: defectLine(d), pattern: d.pattern ?? "" })));

check("At least 10 source files", codebase.size >= 10, `${codebase.size} files`);
check("Every anchor is found in its file", DEFECTS.every((d) => defectLine(d) !== null));
check("Every file named by a defect exists", DEFECTS.every((d) => defectFiles(d).every((f) => codebase.has(f))));
check("At least one pattern repeats across files", new Set(DEFECTS.filter((d) => d.pattern === "sql-concat").map((d) => d.file)).size >= 3);
check("There are cross-file defects", DEFECTS.filter((d) => d.scope === "cross-file").length >= 5);
check("Clean files have no local defect", !DEFECTS.some((d) => d.scope === "local" && CLEAN_FILES.includes(d.file)));

// The scorer must be able to say no, or every later number means nothing.
check("The scorer finds nothing in no findings", scoreFindings([]).found.size === 0);
check("The scorer rejects a right description in the wrong file", defectsMatchedBy({ file: "cart.js", description: "SQL injection" }).length === 0);
check("The scorer accepts a right description in the right file", defectsMatchedBy({ file: "users.js", description: "SQL injection in email" }).some((d) => d.id === "USR-SQL"));

const { items, broken } = parseJsonLines('{"a":1}\n```\n{"a":2}\n{"a":');
check("A truncated final line is dropped and counted", items.length === 2 && broken === 1);

const graph = extractImportGraph(codebase);
check("The import graph sees orders.js -> payments.js", graph["orders.js"].includes("payments.js"));
const contracts = extractContracts(codebase);
check("Contracts include the database return shape", contracts.includes("{ rows, rowCount }"));
check("Contracts include the bad call site", contracts.includes("chargeCard(card, total)"));

finishChecks();
