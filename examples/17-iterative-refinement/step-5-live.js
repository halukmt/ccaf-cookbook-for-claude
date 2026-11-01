// PAID, small: three interacting changes, one message against one at a time. The score comes from running the
// result: a real failure goes from a route, through the logger, into the client, and the errorCode must survive.
//   batch:       one message, through the blueprint's /batch-fixes command
//   sequential:  three messages in one resumed session
//   separate:    three independent sessions, as when three people or three CI jobs each make one change

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { newWorkspace, sumCost } from "./refine-lab.js";

const ISSUES = [
  "Error responses must include an errorCode field. Each failure in errors/routes.js gets its own stable code.",
  "Log entries must carry errorCode, as structured JSON.",
  "The TypeScript types of the client SDK must show the new errorCode field.",
];
const CAP = { tools: "Read,Edit,Grep,Glob", allowedTools: "Read,Edit,Grep,Glob", budgetUsd: 0.3 };

// Runs the real modules of a workspace in a child process and reports what happened.
function probe(dir) {
  const url = (file) => JSON.stringify(pathToFileURL(join(dir, "errors", file)).href);
  const script = `
    const { notFound, rateLimited } = await import(${url("routes.js")});
    const { logError } = await import(${url("logger.js")});
    const { ApiError } = await import(${url("client.js")});
    const out = {};
    for (const [name, make] of Object.entries({ notFound, rateLimited })) {
      const response = make();
      const log = JSON.parse(logError(response));
      const error = new ApiError(response.body, response.status);
      out[name] = { body: response.body, log: log.errorCode, client: error.errorCode };
    }
    console.log(JSON.stringify(out));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  if (run.status !== 0) return { error: run.stderr.slice(0, 300) };
  return JSON.parse(run.stdout);
}

function score(workspace) {
  const result = probe(workspace.work);
  const types = readFileSync(join(workspace.work, "errors/client-types.d.ts"), "utf8");
  if (result.error) return { responses: false, distinct: false, logger: false, client: false, types: /errorCode/.test(types), error: result.error };
  const { notFound, rateLimited } = result;
  const code = (entry) => entry.body.errorCode;
  return {
    responses: Boolean(code(notFound) && code(rateLimited)),
    distinct: code(notFound) !== code(rateLimited),
    logger: notFound.log === code(notFound) && rateLimited.log === code(rateLimited) && Boolean(notFound.log),
    client: notFound.client === code(notFound) && rateLimited.client === code(rateLimited) && Boolean(notFound.client),
    types: /errorCode/.test(types),
  };
}

const all = (entry) => ["responses", "distinct", "logger", "client", "types"].every((key) => entry[key] === true);
const report = (label, entry, runs) => console.log(`${label}: $${sumCost(runs).toFixed(4)}, tools ${runs.flatMap((run) => run.toolCalls).length}, score ${JSON.stringify(entry)}`);

const batchSpace = newWorkspace("batch");
const batch = await runGuarded(batchSpace, `/batch-fixes ${ISSUES.map((issue, index) => `${index + 1}. ${issue}`).join(" ")} All three share the same error structure.`, CAP);
const batchScore = score(batchSpace);
report("batch", batchScore, [batch]);

const sequentialSpace = newWorkspace("sequential");
const sequential = [];
for (const issue of ISSUES) {
  const resume = sequential.length ? { preflight: false, extraArgs: ["--resume", sequential[0].sessionId] } : {};
  sequential.push(await runGuarded(sequentialSpace, issue, { ...CAP, ...resume }));
}
const sequentialScore = score(sequentialSpace);
report("sequential, one session", sequentialScore, sequential);

const separateSpace = newWorkspace("separate");
const separate = [];
for (const issue of ISSUES) separate.push(await runGuarded(separateSpace, issue, CAP));
const separateScore = score(separateSpace);
report("separate sessions", separateScore, separate);

const runs = [batch, ...sequential, ...separate];
console.log(`Total cost: $${sumCost(runs).toFixed(4)}`);

check("all seven runs succeeded", !runs.some((run) => run.isError));
check("batch: a real error carries its code through response, logger, client and types", all(batchScore), JSON.stringify(batchScore));
console.log(`Consistent end to end. batch: ${all(batchScore)}, sequential: ${all(sequentialScore)}, separate: ${all(separateScore)}`);
check("the guard refused nothing and no request held private content", !runs.some((run) => run.blocked > 0 || run.privateSeen));
finishChecks();
