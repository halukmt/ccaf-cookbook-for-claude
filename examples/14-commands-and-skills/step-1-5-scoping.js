// Steps 1, 2, 4, 5, free: real CLI against the stub. What exists for whom, and what each frontmatter field really does.

import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { repoRoot } from "../../_shared/client.js";
import { createLabWorkspace, requestText, runStubbed, writeWorkspaceFile as write } from "../../_shared/config-lab.js";
import { cloneFor, createDeveloper, isForkRequest, promptBlock } from "./skill-lab.js";

const HINT = "Name a feature or an area of the code to analyse";

// --- Steps 1 and 5: who gets what ---------------------------------------------------------------------

const alice = createDeveloper("alice", { withUserSkill: true });
const bob = cloneFor(alice, "bob");

const review = await runStubbed(alice, "/review the auth code");
const reviewPrompt = promptBlock(review.requests[0]);
check("step 1: /review expands to the file's body", reviewPrompt.includes("REVIEW-CHECK-3127"));
check("step 1: arguments replace $ARGUMENTS", reviewPrompt.includes("Focus area, if any: the auth code"));
check("the project command replaces the built-in /review", !/gh pr/.test(reviewPrompt));

const bobReview = await runStubbed(bob, "/review");
check("step 5: a real clone has /review", promptBlock(bobReview.requests[0]).includes("REVIEW-CHECK-3127"));
check("step 5: the command is tracked by git", bob.tracked.includes(".claude/commands/review.md"));

const aliceBrain = await runStubbed(alice, "/brainstorm src/api");
const bobBrain = await runStubbed(bob, "/brainstorm src/api");
check("step 5: /brainstorm exists for its owner", requestText(aliceBrain.requests[0]).includes("BRAIN-SKILL-6650"));
check("step 5: the clone does not have /brainstorm", bobBrain.requests.length === 0 && /Unknown skill/.test(bobBrain.text), bobBrain.text.trim());
check("trap: an unknown command under -p still exits 0, with no API call", bobBrain.exitCode === 0);
check("the skill's file is in nobody's repository", !bob.tracked.some((file) => file.includes("brainstorm")));
check("init reports the skill for its owner only", aliceBrain.init.skills.includes("brainstorm") && !bobBrain.init.skills.includes("brainstorm"));

// --- Step 2: context: fork really forks, and step 4: what argument-hint does ------------------------

check("step 2: context: fork sends the body to a separate agent, not the main system prompt", isForkRequest(aliceBrain.requests[0]));
const noArgs = await runStubbed(alice, "/brainstorm");
const noArgsPrompt = promptBlock(noArgs.requests[0]);
check("step 4: with no argument, -p does not prompt: the skill runs anyway", noArgs.requests.length > 0 && noArgs.exitCode === 0);
check("step 4: $ARGUMENTS becomes empty", noArgsPrompt.includes("Analyse the area named here: \n"));
const allSent = JSON.stringify([...aliceBrain.requests, ...noArgs.requests, ...review.requests]);
check("step 4: the hint is never sent to the model", !allSent.includes(HINT));
const context = await runStubbed(alice, "/context");
check("/context lists the skill with its source", /\| brainstorm \| User \|/.test(context.text));
check("/context lists the command, and calls it Project", /\| review \| Project \|/.test(context.text));

// --- Commands versus skills ---------------------------------------------------------------------------

const mix = createLabWorkspace("mix");
write(mix.work, "CLAUDE.md", "PROJECT-MEMORY-MARK\n");
write(mix.work, ".claude/commands/both.md", "BODY-FROM-COMMAND\n");
write(mix.work, ".claude/skills/both/SKILL.md", "---\ndescription: both as a skill\n---\nBODY-FROM-SKILL\n");
write(mix.work, ".claude/commands/forked.md", "---\ndescription: a forked command\ncontext: fork\n---\nBODY-FORKED-COMMAND\n");
write(mix.work, ".claude/commands/plain.md", "FIRST-LINE-OF-PLAIN\nsecond line\n");
write(mix.work, ".claude/skills/hidden/SKILL.md", "---\ndescription: hidden description\ndisable-model-invocation: true\n---\nBODY-HIDDEN\n");
write(mix.work, ".claude/skills/fork/SKILL.md", "---\ndescription: fork\ncontext: fork\n---\nBODY-FORK\n");

const both = await runStubbed(mix, "/both");
const bothPrompt = promptBlock(both.requests[0]);
console.log("Same name, command and skill. Body sent:", bothPrompt.trim());
check("same name in both places: the skill's body wins", bothPrompt.includes("BODY-FROM-SKILL") && !bothPrompt.includes("BODY-FROM-COMMAND"));
const listing = requestText(both.requests[0]).split("\n").filter((line) => line.startsWith("- "));
check("both are still advertised to the model, so the name appears twice", listing.filter((line) => line.startsWith("- both:")).length === 2);
const forkedCommand = await runStubbed(mix, "/forked");
check("a command honours context: fork too", isForkRequest(forkedCommand.requests[0]));
check("a command without a description advertises its first line to the model", listing.some((line) => line.startsWith("- plain: FIRST-LINE-OF-PLAIN")));
check("a command is listed under slash_commands and not under skills in init", both.init.slash_commands.includes("plain") && !both.init.skills.includes("plain"));
check("disable-model-invocation hides a skill from the model's list", !listing.some((line) => line.startsWith("- hidden:")));
const hidden = await runStubbed(mix, "/hidden");
check("a person can still run that skill by name", promptBlock(hidden.requests[0]).includes("BODY-HIDDEN"));
const fork = await runStubbed(mix, "/fork");
check("a fork still receives the project's CLAUDE.md", requestText(fork.requests[0]).includes("PROJECT-MEMORY-MARK"));

// The blueprint command. Its skill is run in step-3-tool-matrix.js.
const blueprint = createLabWorkspace("blueprint", { sandbox: join(repoRoot, "blueprints", "commands-and-skills") });
const blueprintRun = await runStubbed(blueprint, "/review auth");
const blueprintPrompt = promptBlock(blueprintRun.requests[0]);
check("blueprint: /review expands with its argument", blueprintPrompt.includes("Flag any hardcoded credentials") && blueprintPrompt.includes("Focus area, if any: auth"));
check("blueprint: its usage notes, kept in YAML comments, are not sent", !blueprintPrompt.includes("Copy to .claude/commands"));
write(mix.work, ".claude/commands/commented.md", "<!-- COMMAND-COMMENT -->\nBody\n");
const commented = await runStubbed(mix, "/commented");
check("unlike in CLAUDE.md, an HTML comment in a command's body is sent", promptBlock(commented.requests[0]).includes("COMMAND-COMMENT"));

check("no captured request holds private content", ![review, bobReview, aliceBrain, noArgs, both, fork].some((run) => run.privateSeen));
finishChecks();
