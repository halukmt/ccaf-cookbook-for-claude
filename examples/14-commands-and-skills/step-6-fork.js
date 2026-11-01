// Step 6, free: what a later turn of the main conversation really carries, with and without context: fork.
// Two paths reach a fork: a person typing the command, and the model calling the Skill tool. Both are tested.

import { toolResultsSent } from "../../_shared/api-capture.js";
import { check, finishChecks } from "../../_shared/check.js";
import { requestText, runStubbed, toolUse } from "../../_shared/config-lab.js";
import { createDeveloper, inlineCopyOfSkill, isForkRequest, readAreaScript, SUMMARY_MARKER, VERBOSE_MARKERS } from "./skill-lab.js";

const holdsFiles = (request) => VERBOSE_MARKERS.filter((marker) => requestText(request).includes(marker)).length;
const last = (list) => list[list.length - 1];

async function typedThenFollowUp(label, inline) {
  const workspace = createDeveloper(label, { withUserSkill: true });
  if (inline) inlineCopyOfSkill(workspace);
  const first = await runStubbed(workspace, "/brainstorm src/api", { script: readAreaScript(workspace) });
  const followUp = await runStubbed(workspace, "How many modules were there?", { extraArgs: ["--resume", first.sessionId] });
  return { first, followUp, main: last(followUp.requests) };
}

const forked = await typedThenFollowUp("forked", false);
const inline = await typedThenFollowUp("inline", true);
const size = (run) => JSON.stringify(run.main.messages).length;
console.log(`Follow-up request, messages only: fork ${size(forked)} chars, inline ${size(inline)} chars.`);

check("fork: all three files really went through the forked agent", forked.first.requests.some((request) => isForkRequest(request) && holdsFiles(request) === 3));
check("fork: the later main request holds none of the file contents", holdsFiles(forked.main) === 0);
// The person sees the summary in the output, but the transcript keeps only a
// placeholder, so a resumed conversation under -p has lost it.
check("typed under -p, the summary goes to the output", forked.first.text.includes(SUMMARY_MARKER));
check("typed under -p, a later main request does not hold the summary either", !requestText(forked.main).includes(SUMMARY_MARKER));
check("fork: the later main request does not hold the skill's instructions", !requestText(forked.main).includes("Chart how the modules fit together"));
check("inline control: the later main request holds all three files", holdsFiles(inline.main) === 3);
check("inline control: the same skill without the line ran in the main agent", !isForkRequest(inline.first.requests[0]));
check("the fork's follow-up is far smaller", size(forked) * 5 < size(inline), `${size(forked)} vs ${size(inline)}`);

// The model calling the skill itself, instead of a person typing it.
const workspace = createDeveloper("via-tool", { withUserSkill: true });
const reader = readAreaScript(workspace);
const skillThenFinish = (request, index) => {
  if (isForkRequest(request)) return reader();
  return index === 0 ? [toolUse("Skill", { skill: "brainstorm", args: "src/api" })] : "Here is what the skill found.";
};
const viaTool = await runStubbed(workspace, "Explore src/api for me.", { allowedTools: "Skill", script: skillThenFinish });
const refused = await runStubbed(createDeveloper("no-skill-allow", { withUserSkill: true }), "Explore src/api for me.", {
  script: (_, index) => (index === 0 ? [toolUse("Skill", { skill: "brainstorm", args: "src/api" })] : "ok"),
});
check("under dontAsk without an allow for Skill, the model's call is refused, while a typed command runs", toolResultsSent(refused.requests).some((result) => result.toolName === "Skill" && result.isError));
const lastMain = last(viaTool.requests.filter((request) => !isForkRequest(request)));
check("via the Skill tool: a separate agent read the files", viaTool.requests.some((request) => isForkRequest(request) && holdsFiles(request) === 3));
check("via the Skill tool: the main agent got the summary as a tool result", requestText(lastMain).includes(SUMMARY_MARKER));
check("via the Skill tool: the main agent never got the file contents", holdsFiles(lastMain) === 0);

check("no captured request holds private content", ![forked.first, forked.followUp, inline.first, inline.followUp, viaTool].some((run) => run.privateSeen));
finishChecks();
