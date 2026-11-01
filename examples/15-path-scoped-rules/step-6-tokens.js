// Step 6: real token counts. The stub captures the exact request, and the Messages count_tokens endpoint, which
// is not billed, counts it. A body with private content would throw before being sent.

import { check, finishChecks } from "../../_shared/check.js";
import { client, FAST_MODEL } from "../../_shared/client.js";
import { hasPrivateContent } from "../../_shared/config-lab.js";
import { allInRootWorkspace, newWorkspace, read, runSteps } from "./rules-lab.js";

async function countTokens(request) {
  const body = {
    model: FAST_MODEL,
    system: request.system,
    messages: request.messages,
    tools: request.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
  };
  if (hasPrivateContent(JSON.stringify(body))) throw new Error("Private content in a request. Nothing was sent.");
  return (await client.messages.countTokens(body)).input_tokens;
}

const TASKS = {
  "no file touched": [],
  "utility file": [read("src/utils/format.ts")],
  "test file": [read("src/utils/format.test.ts")],
  "API file": [read("src/api/auth.ts")],
  "all three file types": [read("src/utils/format.test.ts"), read("src/api/auth.ts"), read("terraform/main.tf")],
};

const table = [];
for (const [task, steps] of Object.entries(TASKS)) {
  const rootRun = await runSteps(allInRootWorkspace("root"), steps);
  const scopedRun = await runSteps(newWorkspace("scoped"), steps);
  const root = await countTokens(rootRun.requests.at(-1));
  const scoped = await countTokens(scopedRun.requests.at(-1));
  table.push({ task, root, scoped, saved: root - scoped });
  if (rootRun.privateSeen || scopedRun.privateSeen) throw new Error("Private content in a captured request.");
}
console.table(table);

const row = (task) => table.find((entry) => entry.task === task);
check("no file touched: path rules cost less than the all-in-root file", row("no file touched").saved > 0, `${row("no file touched").saved} tokens`);
check("utility file: path rules cost less", row("utility file").saved > 0, `${row("utility file").saved} tokens`);
check("test file: path rules still cost less, by the two rules not loaded", row("test file").saved > 0 && row("test file").saved < row("utility file").saved, `${row("test file").saved} tokens`);
check("all three file types: the saving is gone, within a small overhead", Math.abs(row("all three file types").saved) < row("utility file").saved / 2, `${row("all three file types").saved} tokens`);

finishChecks();
