// PAID, small: the comparison from step-6-fork.js with a real model. Three pairs of a skill run and a
// follow-up, Haiku, each with a budget cap. Run it once; the free scripts need no repeat of it.

import { check, finishChecks } from "../../_shared/check.js";
import { requestText, runGuarded } from "../../_shared/config-lab.js";
import { createDeveloper, inlineCopyOfSkill, VERBOSE_MARKERS } from "./skill-lab.js";

const FOLLOW_UP = "In one short sentence: what did the brainstorm you just did find about src/api? If you have no record of one, reply NO-RECORD.";
const VIA_TOOL = "Use the Skill tool to run the brainstorm skill with the argument src/api, then give me its result.";
const TOOLS = { tools: "Read,Grep,Glob,Skill", allowedTools: "Skill", budgetUsd: 0.4 };

async function pair(label, prompt, { inline = false } = {}) {
  const workspace = createDeveloper(label, { withUserSkill: true });
  if (inline) inlineCopyOfSkill(workspace);
  const skill = await runGuarded(workspace, prompt, TOOLS);
  const followUp = await runGuarded(workspace, FOLLOW_UP, { budgetUsd: 0.1, preflight: false, tools: "", extraArgs: ["--resume", skill.sessionId] });
  const usage = followUp.usage ?? {};
  const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const files = VERBOSE_MARKERS.filter((marker) => followUp.requests.some((request) => requestText(request).includes(marker))).length;
  console.log(`${label}: skill $${skill.costUsd.toFixed(4)}, follow-up $${followUp.costUsd.toFixed(4)}, follow-up input tokens ${inputTokens}, files in it ${files}`);
  console.log(`  answer: ${followUp.text.trim().slice(0, 300)}`);
  return { skill, followUp, inputTokens, files };
}

const typed = await pair("typed-fork", "/brainstorm src/api");
const forked = await pair("tool-fork", VIA_TOOL);
const inline = await pair("tool-inline", VIA_TOOL, { inline: true });
const runs = [typed, forked, inline].flatMap((entry) => [entry.skill, entry.followUp]);
console.log(`\nTotal cost: $${runs.reduce((sum, run) => sum + run.costUsd, 0).toFixed(4)}`);

check("all six runs succeeded", !runs.some((run) => run.isError));
check("typed fork: the output held a real result", typed.skill.text.length > 50, `${typed.skill.text.length} chars`);
check("typed fork: no files in the follow-up request", typed.files === 0);
check("typed fork: a resumed session has no record of the result", /NO-RECORD/.test(typed.followUp.text));
check("skill-tool fork: no files in the follow-up request", forked.files === 0);
check("skill-tool fork: the model can still answer about the result", !/NO-RECORD/.test(forked.followUp.text));
check("inline: file contents are in the follow-up request", inline.files > 0);
check("skill-tool fork used fewer follow-up input tokens than inline", forked.inputTokens < inline.inputTokens, `${forked.inputTokens} vs ${inline.inputTokens}`);
check("the guard refused nothing and no request held private content", !runs.some((run) => run.blocked > 0 || run.privateSeen));

finishChecks();
