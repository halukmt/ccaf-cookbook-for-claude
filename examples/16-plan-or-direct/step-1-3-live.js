// PAID: steps 1, 2 and 3 with a real model, Haiku, each CLI call capped. Run once. Judged from the files, the
// real test results and the tool calls, not from what the model reports.
//   Step 1: plan mode on an architecture question.
//   Step 2: one obvious bug, direct execution against plan-then-execute.
//   Step 3: a library migration, plan-then-execute against direct execution.

import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { hashTree, legacyImports, modernImports, newWorkspace, runProjectTests, sumCost, toolNames } from "./plan-lab.js";

const CAP = { budgetUsd: 0.5 };
const PLAN_TOOLS = { tools: "Read,Grep,Glob,Edit,Write,Bash,ExitPlanMode", permissionMode: "plan" };
const EXECUTE = { tools: "Read,Grep,Glob,Edit", allowedTools: "Read,Grep,Glob,Edit" };
const report = (label, runs) => console.log(`${label}: $${sumCost(runs).toFixed(4)}, ${runs.reduce((sum, run) => sum + run.durationSeconds, 0)}s, turns ${runs.reduce((sum, run) => sum + run.turns, 0)}, tools ${runs.flatMap(toolNames).length}`);
const allRuns = [];
const track = (run) => { allRuns.push(run); return run; };

// --- Step 1 ----------------------------------------------------------------------------------------

const auth = newWorkspace("step1");
const authBefore = hashTree(auth.work);
const analysis = track(await runGuarded(auth, "Analyse the authentication module in src/auth. Map all files importing from it, trace what depends on what, and propose two approaches to moving it out into a service of its own, with tradeoffs. Give the whole analysis in your final reply.", { ...PLAN_TOOLS, ...CAP }));
report("Step 1, plan mode", [analysis]);
console.log(analysis.text.slice(0, 1500), "\n");
check("step 1: the run succeeded", !analysis.isError);
check("step 1: no file changed", hashTree(auth.work) === authBefore);
check("step 1: the importers are named", ["users", "orders", "reports", "invoices"].every((name) => analysis.text.includes(name)));
check("step 1: it found the blocking detail, the in-process session map", /in-?(process|memory)|Map\b|shared state|session (state|store|map)/i.test(analysis.text));
check("step 1: it gave two approaches", /approach\s*(1|2|a|b|one|two)|option\s*(1|2|a|b)/i.test(analysis.text));

// --- Step 2 ----------------------------------------------------------------------------------------

const BUG = 'Fix this crash. TypeError: Cannot read properties of undefined (reading \'name\') at displayName (src/utils/format.js:3), called from src/api/public.js when request.user is undefined. An anonymous visitor must get the display name "Guest".';

const directFix = newWorkspace("step2-direct");
const fix = track(await runGuarded(directFix, BUG, { ...EXECUTE, ...CAP }));
const directTests = runProjectTests(directFix.work);

const plannedFix = newWorkspace("step2-planned");
const fixPlan = track(await runGuarded(plannedFix, `${BUG} Give your plan in your final reply.`, { ...PLAN_TOOLS, ...CAP }));
const fixExecute = track(await runGuarded(plannedFix, "Now execute that plan.", { ...EXECUTE, ...CAP, preflight: false, extraArgs: ["--resume", fixPlan.sessionId] }));
const plannedTests = runProjectTests(plannedFix.work);

report("Step 2, direct", [fix]);
report("Step 2, plan then execute", [fixPlan, fixExecute]);
check("step 2 direct: the test suite is green", directTests.fail === 0 && directTests.pass === 6, `${directTests.pass} pass`);
check("step 2 plan-first: the test suite is green", plannedTests.fail === 0 && plannedTests.pass === 6, `${plannedTests.pass} pass`);
check("step 2: direct cost less than plan-first", sumCost([fix]) < sumCost([fixPlan, fixExecute]), `$${sumCost([fix]).toFixed(4)} vs $${sumCost([fixPlan, fixExecute]).toFixed(4)}`);

// --- Step 3 ----------------------------------------------------------------------------------------

const MIGRATION = "Migrate src/ from vendor/legacy-date.js to vendor/modern-date.js. Do not change anything in vendor/ or test/. test/dates.test.js must keep passing, without editing it. Afterwards, nothing under src/ may import the old library.";

const hybrid = newWorkspace("step3-hybrid");
const hybridBefore = hashTree(hybrid.work);
const migrationPlan = track(await runGuarded(hybrid, `Plan this migration, do not change files yet. List every file that imports the old library, work out how the two APIs differ for each way it is used, name edge cases. Give the plan in your final reply. ${MIGRATION}`, { ...PLAN_TOOLS, ...CAP }));
const unchangedAfterPlan = hashTree(hybrid.work) === hybridBefore;
const migrationExecute = track(await runGuarded(hybrid, "Now execute the plan, file by file, using the patterns you identified.", { ...EXECUTE, budgetUsd: 0.7, preflight: false, extraArgs: ["--resume", migrationPlan.sessionId] }));
const hybridTests = runProjectTests(hybrid.work);

const direct = newWorkspace("step3-direct");
const directRun = track(await runGuarded(direct, MIGRATION, { ...EXECUTE, budgetUsd: 0.7 }));
const directMigrationTests = runProjectTests(direct.work);

report("Step 3, plan then execute", [migrationPlan, migrationExecute]);
report("Step 3, direct", [directRun]);
console.log(`Step 3 tests. Hybrid: ${hybridTests.pass} pass, ${hybridTests.fail} fail [${hybridTests.failed}]. Direct: ${directMigrationTests.pass} pass, ${directMigrationTests.fail} fail [${directMigrationTests.failed}].`);
console.log(`Step 3 plan excerpt:\n${migrationPlan.text.slice(0, 1200)}\n`);

check("step 3: the plan phase changed nothing", unchangedAfterPlan);
check("step 3: the plan names the mutation difference", /mutat/i.test(migrationPlan.text));
check("step 3: the plan names the reversed argument order", /revers|order|swap|flip/i.test(migrationPlan.text));
check("step 3 hybrid: nothing imports the old library", legacyImports(hybrid.work).length === 0, legacyImports(hybrid.work).join(","));
check("step 3 hybrid: all four handler files use the new library", modernImports(hybrid.work).length === 4);
check("step 3 hybrid: the date tests pass", !hybridTests.failed.some((name) => /users|orders|reports|invoices/.test(name)));
console.log(`Step 3 direct: legacy imports left ${legacyImports(direct.work).length}, modern ${modernImports(direct.work).length}.`);

// --- Whole script ------------------------------------------------------------------------------------

console.log(`\nTotal cost: $${sumCost(allRuns).toFixed(4)}`);
check("the guard refused nothing and no request held private content", !allRuns.some((run) => run.blocked > 0 || run.privateSeen));
finishChecks();
