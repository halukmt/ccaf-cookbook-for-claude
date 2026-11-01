// Runs the real CLI on a temp copy of the fixture, and judges the result from the tool calls and files.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { copyLegacyOrders, DECOY_FILES, hashDirectory, LEGACY_ORDERS_DIR } from "../../_fixtures/legacy-orders.js";
import { createCliWorkspace, runPrompt } from "../../_shared/claude-cli.js";

// All the model can use. Anything else, including Bash and Write, is not offered.
export const TOOLS = "Read,Grep,Glob,Edit";

export const TASK = `Migrate this project from the deprecated processLegacyOrder(orderId) to processOrder(orderId, { validate: true }).

Work in this order and use your tools:
1. Grep for processLegacyOrder to find who references it. Do not open files before that.
2. Glob for test files, using the pattern **/*.test.js.
3. Read only the files the search showed to be relevant. Follow barrel files and wrappers. A caller of a wrapper needs no change if the wrapper itself is migrated.
4. Edit each caller. Fix each file's import too. Import from wherever that file already imports from: ./index.js exports processOrder, and ./orders.js defines it.

Rules:
- Migrate every caller, except that handlePartialRefund and handleChargeback in RefundHandler.js stay on the legacy function for this release, and handleRefund moves now. Do not change those two.
- Do not change the definition in legacyOrders.js or the exports of index.js.
- In RefundHandler.js, make your first Edit attempt on the call with old_string exactly "const result = await processLegacyOrder(orderId);" and no replace_all, then recover from what the tool reports by widening old_string.
- In InvoiceJob.js every call should change: use replace_all for those calls.

End with a list of the files you changed.`;

export function createRefactorWorkspace() {
  const workspace = createCliWorkspace("refactor");
  copyLegacyOrders(workspace.work);
  return workspace;
}

export function runRefactor(workspace, options = {}) {
  return runPrompt(workspace, TASK, { allowedTools: TOOLS, extraArgs: ["--tools", TOOLS], ...options });
}

const fileOf = (call) => basename(String(call.input.file_path ?? "").replace(/\\/g, "/"));

// Runs the migrated code itself, in the temp copy, and asks which implementation each function reached.
export function probeBehaviour(dir) {
  const script = `
    const load = (file) => import(${JSON.stringify(pathToFileURL(dir).href)} + "/" + file);
    const r = await load("RefundHandler.js"), i = await load("InvoiceJob.js"), o = await load("OrderProcessor.js"), c = await load("CheckoutFlow.js");
    const out = {};
    for (const [name, fn] of Object.entries({ handleRefund: r.handleRefund, handlePartialRefund: r.handlePartialRefund, handleChargeback: r.handleChargeback,
      invoiceOne: i.invoiceOne, invoiceAgain: i.invoiceAgain, processIncoming: o.processIncoming, checkout: c.checkout })) {
      const result = await fn("ORD-1");
      out[name] = { via: result.via, validated: result.validated ?? null };
    }
    console.log(JSON.stringify(out));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  if (run.status !== 0) return { error: run.stderr.slice(0, 500) };
  return JSON.parse(run.stdout);
}

export function runFixtureTests(dir) {
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap"], { cwd: dir, encoding: "utf8" });
  return { passed: run.status === 0, tests: Number(run.stdout.match(/# pass (\d+)/)?.[1] ?? 0) };
}

const MIGRATED = ["handleRefund", "invoiceOne", "invoiceAgain", "processIncoming", "checkout"];
const KEPT = ["handlePartialRefund", "handleChargeback"];

// Pure judgement of one run: it reads only the tool calls and the directory, so it can be tested on
// runs that did the wrong thing. Returns [label, pass, detail] rows.
export function judgeRun(toolCalls, dir) {
  const names = toolCalls.map((call) => call.name);
  const firstOf = (name) => names.indexOf(name);
  const reads = toolCalls.filter((call) => call.name === "Read").map(fileOf);
  const edits = toolCalls.filter((call) => call.name === "Edit");
  const refundEdits = edits.filter((call) => fileOf(call) === "RefundHandler.js");
  const callEdits = refundEdits.filter((call) => String(call.input.old_string).includes("processLegacyOrder(orderId)"));
  const firstRefund = callEdits[0];
  const widened = callEdits.find((call) => !call.isError && String(call.input.old_string).includes("handleRefund"));
  const invoiceAll = edits.find((call) => fileOf(call) === "InvoiceJob.js" && call.input.replace_all === true && !call.isError);
  const read = (file) => readFileSync(join(dir, file), "utf8");
  const count = (file, text) => read(file).split(text).length - 1;
  const behaviour = probeBehaviour(dir);
  const tests = runFixtureTests(dir);

  return [
    ["Only the four offered tools were called", names.length > 0 && names.every((name) => TOOLS.split(",").includes(name)), [...new Set(names)].join(", ")],
    ["Grep came before any Read", firstOf("Grep") >= 0 && (firstOf("Read") === -1 || firstOf("Grep") < firstOf("Read")), `Grep #${firstOf("Grep")}, Read #${firstOf("Read")}`],
    ["Glob was used for the test files", toolCalls.some((call) => call.name === "Glob" && String(call.input.pattern).includes(".test.")), ""],
    ["Read came before any Edit", firstOf("Read") >= 0 && firstOf("Read") < firstOf("Edit"), ""],
    ["Reads were incremental: no unrelated file was opened", reads.length > 0 && !reads.some((file) => DECOY_FILES.includes(file)), reads.join(", ")],
    ["Edit was the modification tool, and it was used", edits.some((call) => !call.isError) && !names.includes("Write"), `${edits.length} Edit calls`],
    ["The first Edit on the short anchor really failed", firstRefund?.isError === true && firstRefund.input.replace_all !== true, firstRefund?.resultText ?? "no such call"],
    ["The failure says the match was not unique", /multiple|matches|unique|\b3\b/i.test(firstRefund?.resultText ?? ""), ""],
    ["A wider anchor naming handleRefund then succeeded", Boolean(widened), widened ? JSON.stringify(widened.input.old_string) : ""],
    ["replace_all migrated InvoiceJob.js in one Edit", Boolean(invoiceAll), ""],
    ["RefundHandler.js: one call moved, two stayed", count("RefundHandler.js", "await processOrder(orderId, { validate: true })") === 1 && count("RefundHandler.js", "await processLegacyOrder(orderId)") === 2, ""],
    ["InvoiceJob.js: no legacy reference is left", !read("InvoiceJob.js").includes("processLegacyOrder") && count("InvoiceJob.js", "{ validate: true }") === 2, ""],
    ["OrderProcessor.js: no legacy reference is left", !read("OrderProcessor.js").includes("processLegacyOrder"), ""],
    ["orderWrapper.js: no legacy reference is left", !read("orderWrapper.js").includes("processLegacyOrder"), ""],
    ["CheckoutFlow.js needed no change", !edits.some((call) => fileOf(call) === "CheckoutFlow.js"), ""],
    ["The legacy definition and the barrel are unchanged", read("legacyOrders.js") === readFileSync(join(LEGACY_ORDERS_DIR, "legacyOrders.js"), "utf8") && read("index.js") === readFileSync(join(LEGACY_ORDERS_DIR, "index.js"), "utf8"), ""],
    ["Running code: migrated functions reach the new API with validate", !behaviour.error && MIGRATED.every((name) => behaviour[name]?.via === "new" && behaviour[name]?.validated === true), JSON.stringify(behaviour)],
    ["Running code: the two excepted handlers stay legacy", !behaviour.error && KEPT.every((name) => behaviour[name]?.via === "legacy"), ""],
    ["The fixture's own tests pass on the migrated copy", tests.passed && tests.tests >= 9, `${tests.tests} tests`],
  ];
}

export const fixtureHash = () => hashDirectory(LEGACY_ORDERS_DIR);
