// PAID, small: the interview pattern through the blueprint's command, then answers through --resume, with a direct
// request as control. No tools, a short system prompt, Haiku.
// Under -p the questions end the run, so the answers go in a second, resumed call.

import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { newWorkspace, sumCost } from "./refine-lab.js";

const QUIET = {
  tools: "",
  budgetUsd: 0.1,
  env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4000" },
  extraArgs: ["--system-prompt", "You are a senior engineer. You have no tools. Answer in plain text."],
};
const TOPICS = {
  invalidation: /invalidat/i,
  consistency: /consisten|stale/i,
  failure: /fail(s|ure|ing)?\b|fail.?(open|closed)|unavailable|goes down/i,
  ttl: /\bttl\b|expir/i,
  keys: /cache key|key(s| design)|vary|per.?user/i,
  security: /sensitive|authori[sz]|tenant|private|personal/i,
  scale: /traffic|size|memory|eviction|distributed|instances|replica/i,
};
const topicsIn = (text) => Object.entries(TOPICS).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
const questionsIn = (text) => text.split("\n").filter((line) => line.includes("?")).length;

const REQUEST = "a caching layer for the API";
const workspace = newWorkspace("interview");
const interview = await runGuarded(workspace, `/interview-first ${REQUEST}`, QUIET);
const answers = "1. Cache GET responses for 90 seconds. 2. If the cache is down, fail open: serve from the origin and log a warning. 3. Per-user responses must never be shared. Assume sensible defaults for the rest. Now implement it as one JavaScript module, and reply with the code only.";
const implementation = await runGuarded(workspace, answers, { ...QUIET, preflight: false, extraArgs: [...QUIET.extraArgs, "--resume", interview.sessionId] });

const control = await runGuarded(newWorkspace("no-interview"), `I need ${REQUEST}. Implement it as one JavaScript module.`, QUIET);

const questions = questionsIn(interview.text);
console.log(`Interview ($${interview.costUsd.toFixed(4)}): ${questions} question lines, topics [${topicsIn(interview.text)}]`);
console.log(`${interview.text.slice(0, 1600)}\n`);
console.log(`Control ($${control.costUsd.toFixed(4)}): ${questionsIn(control.text)} question lines, topics [${topicsIn(control.text)}]`);
console.log(`Control starts:\n${control.text.slice(0, 500)}\n`);
console.log(`Implementation after answers ($${implementation.costUsd.toFixed(4)}):\n${implementation.text.slice(0, 700)}\n`);
console.log(`Total cost: $${sumCost([interview, implementation, control]).toFixed(4)}`);

check("all three runs succeeded", ![interview, implementation, control].some((run) => run.isError));
check("the interview asked 5 to 10 questions", questions >= 5 && questions <= 12, `${questions} lines with a question mark`);
check("it covered at least the four core topics", ["invalidation", "consistency", "failure", "ttl"].every((topic) => topicsIn(interview.text).includes(topic)), topicsIn(interview.text).join(","));
check("it wrote no implementation yet", !/export (async )?function|class \w+Cache|module\.exports/.test(interview.text));
check("the implementation used the answered TTL", /\b90\b|90_?000/.test(implementation.text));
check("the implementation kept per-user responses apart", /user|authori[sz]ation|private/i.test(implementation.text));
check("the implementation fails open", /catch|warn/i.test(implementation.text));
check("the control went straight to code", /export|class |function /.test(control.text));
check("the guard refused nothing and no request held private content", ![interview, implementation, control].some((run) => run.blocked > 0 || run.privateSeen));
finishChecks();
