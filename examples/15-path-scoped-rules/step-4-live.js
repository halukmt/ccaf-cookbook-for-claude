// PAID, small: a real model edits a test file. The testing rule tells it to start each edited test file with a
// marker comment, which the task itself never mentions. So the file on disk shows whether the rule reached the
// model and was acted on. The list form's frontmatter runs as a control on the same task.

import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { requestText, runGuarded } from "../../_shared/config-lab.js";
import { LIST_FORM, IDS, newWorkspace } from "./rules-lab.js";

const PROMPT = "Read src/utils/format.test.ts, then use Edit to add one more it() test to that file for an empty string input. Follow your project's conventions.";

async function run(label, literal) {
  const workspace = newWorkspace(label);
  if (literal) cpSync(LIST_FORM, workspace.work, { recursive: true });
  const result = await runGuarded(workspace, PROMPT, { tools: "Read,Edit", allowedTools: "Read,Edit", budgetUsd: 0.2 });
  const file = readFileSync(join(workspace.work, "src", "utils", "format.test.ts"), "utf8");
  const ruleSent = result.requests.some((request) => requestText(request).includes(IDS.testing));
  console.log(`${label}: $${result.costUsd.toFixed(4)}, tools ${result.toolCalls.map((call) => call.name)}, rule in a request: ${ruleSent}, file starts: ${file.split("\n")[0]}`);
  return { result, file, ruleSent };
}

const working = await run("comma-form", false);
const literal = await run("list-form", true);
console.log(`Total cost: $${(working.result.costUsd + literal.result.costUsd).toFixed(4)}`);

check("both runs succeeded and both edited the file", !working.result.isError && !literal.result.isError && /empty/i.test(working.file) && /empty/i.test(literal.file));
check("working form: the rule was in a request", working.ruleSent);
check("working form: the model acted on it, with a marker the task never mentioned", working.file.includes(IDS.testing));
check("list form: the rule was never sent", !literal.ruleSent);
check("list form: the file has no marker", !literal.file.includes(IDS.testing));
check("the guard refused nothing and no request held private content", ![working.result, literal.result].some((entry) => entry.blocked > 0 || entry.privateSeen));
finishChecks();
