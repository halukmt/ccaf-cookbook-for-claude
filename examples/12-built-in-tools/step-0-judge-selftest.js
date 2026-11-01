// Free: the judge must fail on bad runs, or a passing live run proves nothing. No model involved.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { makeTempDir } from "../../_shared/agent-env.js";
import { copyLegacyOrders } from "../../_fixtures/legacy-orders.js";
import { judgeRun, runFixtureTests } from "./refactor-lab.js";

const failing = (rows) => rows.filter(([, pass]) => !pass).map(([label]) => label);

const untouched = makeTempDir("judge");
copyLegacyOrders(untouched);
const baseline = runFixtureTests(untouched);
check("The fixture's tests pass before any migration", baseline.passed && baseline.tests >= 9, `${baseline.tests} tests`);

const emptyRun = failing(judgeRun([], untouched));
check("An empty run on untouched files fails almost everything", emptyRun.length >= 15, `${emptyRun.length} failing`);

const file = (name) => join(untouched, name);
const lazy = [
  { name: "Read", input: { file_path: file("shipping.js") }, isError: false },
  { name: "Grep", input: { pattern: "processLegacyOrder" }, isError: false },
  { name: "Write", input: { file_path: file("RefundHandler.js") }, isError: false },
];
const lazyFails = failing(judgeRun(lazy, untouched));
check("Read before Grep is caught", lazyFails.includes("Grep came before any Read"));
check("Opening an unrelated file is caught", lazyFails.some((l) => l.startsWith("Reads were incremental")));
check("Write is caught", lazyFails.includes("Only the four offered tools were called"));

const overdone = makeTempDir("judge");
copyLegacyOrders(overdone);
const refund = join(overdone, "RefundHandler.js");
writeFileSync(refund, readFileSync(refund, "utf8").replaceAll("processLegacyOrder(orderId)", "processOrder(orderId, { validate: true })").replace("processLegacyOrder", "processOrder"));
const overdoneFails = failing(judgeRun([], overdone));
check("Changing all three refund calls is caught", overdoneFails.includes("RefundHandler.js: one call moved, two stayed"));
check("The behaviour probe also catches it", overdoneFails.includes("Running code: the two excepted handlers stay legacy"));

finishChecks();
