// PAID, two small Haiku calls with no tools. The same boundary as step-6-user-scope.js, judged by a planted
// id the model cannot know unless its file loaded. Each run passes a stub preflight first, and then goes
// through the guarded proxy, which refuses any request holding private content.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { prepareTwoDevelopers, CONVENTION_ID, PROJECT_ID } from "./two-developers.js";

const { alice, bob } = prepareTwoDevelopers(dirname(fileURLToPath(import.meta.url)));
const PROMPT = "Your instructions may hold ids. Answer in exactly two lines. Line 1: the standards id, or NONE. Line 2: the convention id of the verbose variable names rule, or NONE. Do not guess.";

const first = await runGuarded(alice, PROMPT, { tools: "" });
const second = await runGuarded(bob, PROMPT, { tools: "" });
console.log(`First developer ($${first.costUsd.toFixed(4)}):\n${first.text}\n`);
console.log(`Second developer ($${second.costUsd.toFixed(4)}):\n${second.text}\n`);

check("both runs succeeded", !first.isError && !second.isError);
check("first developer's model knows the project id and the user-level id", first.text.includes(PROJECT_ID) && first.text.includes(CONVENTION_ID));
check("second developer's model knows the project id", second.text.includes(PROJECT_ID));
check("second developer's model does not know the user-level id", !second.text.includes(CONVENTION_ID) && /NONE/.test(second.text));
check("the guard refused nothing and no request held private content", first.blocked === 0 && second.blocked === 0 && !first.privateSeen && !second.privateSeen);
console.log(`Total cost: $${(first.costUsd + second.costUsd).toFixed(4)}`);

finishChecks();
