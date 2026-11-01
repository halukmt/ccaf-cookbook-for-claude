// Step 6, free: one convention moves to user level. Two temp config dirs play two people, and the second
// person gets a real `git clone`. No file under the real ~/.claude is touched.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { mainRequests, memoryFiles, requestText, runStubbed } from "../../_shared/config-lab.js";
import { prepareTwoDevelopers, CONVENTION_ID, PROJECT_ID } from "./two-developers.js";

const { alice, bob } = prepareTwoDevelopers(dirname(fileURLToPath(import.meta.url)));

const runA = await runStubbed(alice, "hello");
const runB = await runStubbed(bob, "hello");
const requestA = mainRequests(runA.requests)[0];
const requestB = mainRequests(runB.requests)[0];

check("the project file no longer holds the moved convention", !readFileSync(join(alice.work, ".claude/CLAUDE.md"), "utf8").includes(CONVENTION_ID));
check("first developer: the convention loads from user level", requestText(requestA).includes(CONVENTION_ID));
check("the CLI labels that file as user-level", memoryFiles(requestA).some((file) => file.path.endsWith("config/CLAUDE.md") && /private global/.test(file.label)));
check("second developer, real clone, own config: the convention is absent", !requestText(requestB).includes(CONVENTION_ID));
check("second developer still receives the committed project standards", requestText(requestB).includes(PROJECT_ID));
check("the clone tracks the project file", spawnSync("git", ["ls-files", ".claude/CLAUDE.md"], { cwd: bob.work, encoding: "utf8" }).stdout.trim() === ".claude/CLAUDE.md");
check("no captured request holds private content", !runA.privateSeen && !runB.privateSeen);

// Same evidence through the diagnostic.
const contextA = await runStubbed(alice, "/context");
const contextB = await runStubbed(bob, "/context");
check("/context lists a User row for the first developer only", /\| User \|/.test(contextA.text) && !/\| User \|/.test(contextB.text));

finishChecks();
