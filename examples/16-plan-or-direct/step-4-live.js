// PAID, small: step 4 with a real model. The same discovery request, once delegated to the Explore subagent and
// once done in the main conversation. The evidence is which requests really carried the file contents.

import { check, finishChecks } from "../../_shared/check.js";
import { blockText, requestText, runGuarded } from "../../_shared/config-lab.js";
import { API_MARKERS, newWorkspace, sumCost, toolNames } from "./plan-lab.js";

const TASK = "survey the whole src/api module: name every file, follow how the files depend on each other, note its patterns and anti-patterns, and report what you found in at most eight bullet points.";
const isMain = (request) => blockText(request.system).includes("interactive agent");
const markersIn = (requests) => API_MARKERS.filter((marker) => requests.some((request) => requestText(request).includes(marker))).length;
// A marker is one comment line, so a summary may legitimately quote it. Handler bodies are what a whole file costs.
const BODY_LINE = /Handler 7: checks the session/;
const bodiesIn = (requests) => requests.filter((request) => BODY_LINE.test(requestText(request))).length;
const size = (request) => JSON.stringify(request.messages).length;

async function run(label, prompt, tools) {
  const result = await runGuarded(newWorkspace(label), prompt, { tools, allowedTools: tools, budgetUsd: 0.5 });
  const main = result.requests.filter(isMain);
  const summary = { label, costUsd: result.costUsd, tools: toolNames(result), mainRequests: main.length, otherRequests: result.requests.length - main.length, markersQuotedInMain: markersIn(main), bodiesInMain: bodiesIn(main), bodiesElsewhere: bodiesIn(result.requests.filter((request) => !isMain(request))), markersAnywhere: markersIn(result.requests), lastMainSize: size(main.at(-1)) };
  console.log(JSON.stringify(summary));
  return { result, summary };
}

const delegated = await run("explore", `Use the Explore subagent to ${TASK}`, "Agent,Read,Grep,Glob");
const inline = await run("inline", `Do not use a subagent. Yourself, ${TASK}`, "Read,Grep,Glob");
console.log(`\nDelegated answer:\n${delegated.result.text.slice(0, 900)}\n`);
console.log(`Total cost: $${sumCost([delegated.result, inline.result]).toFixed(4)}`);

check("both runs succeeded", !delegated.result.isError && !inline.result.isError);
check("the model called the Agent tool", delegated.summary.tools.includes("Agent"));
check("the delegated files were read by another agent", delegated.summary.markersAnywhere === API_MARKERS.length, `${delegated.summary.markersAnywhere} of ${API_MARKERS.length}`);
check("the subagent's requests held the handler bodies", delegated.summary.bodiesElsewhere > 0);
check("the main conversation held no handler bodies", delegated.summary.bodiesInMain === 0, `markers quoted in the summary: ${delegated.summary.markersQuotedInMain}`);
check("inline, the main conversation held handler bodies", inline.summary.bodiesInMain > 0);
check("the last main request was smaller when delegated", delegated.summary.lastMainSize < inline.summary.lastMainSize, `${delegated.summary.lastMainSize} vs ${inline.summary.lastMainSize} chars`);
check("the guard refused nothing and no request held private content", ![delegated.result, inline.result].some((run) => run.blocked > 0 || run.privateSeen));
finishChecks();
