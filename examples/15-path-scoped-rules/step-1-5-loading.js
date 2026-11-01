// Steps 1 to 5, free: a real CLI against the stub, a scripted model touching files, and the request bodies as evidence.
// Also answers what triggers a path rule: Read, Edit, Write, Grep, Glob or Bash.

import { cpSync } from "node:fs";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { repoRoot } from "../../_shared/client.js";
import { requestText, runStubbed, writeWorkspaceFile } from "../../_shared/config-lab.js";
import { bash, edit, LIST_FORM, glob, grep, IDS, newWorkspace, read, runSteps, write } from "./rules-lab.js";

const same = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const occurrences = (request, marker) => requestText(request).split(marker).length - 1;

// The list form first: inline arrays with several globs. They load nothing at all.
const literal = newWorkspace("literal");
cpSync(LIST_FORM, literal.work, { recursive: true });
const literalReads = await runSteps(literal, [read("src/utils/format.test.ts"), read("src/api/auth.ts"), read("terraform/main.tf")]);
console.log("List form, rules per request while reading all three file types:", literalReads.afterEach);
check("list form: multi-glob arrays never load, at start or after a matching Read", literalReads.afterEach.every((rules) => rules.length === 0));

// Everything below uses the sandbox's working form: one quoted, comma-separated string.
const start = await runSteps(newWorkspace("start"), []);
check("at session start no scoped rule is in the request", start.afterEach[0].length === 0);

// Steps 4 and 5: each file type pulls in its own rule only. afterEach[1] is the request right after the tool result.
const expectations = [
  ["src/utils/format.test.ts", ["testing"]],
  ["src/components/Button.test.tsx", ["testing"]],
  ["src/utils/other.spec.ts", ["testing"]],
  ["src/api/auth.ts", ["api"]],
  ["services/billing/routes/invoices.ts", ["api"]],
  ["terraform/main.tf", ["terraform"]],
  ["infra/edge/edge.tf", ["terraform"]],
  ["src/utils/format.ts", []],
];
for (const [path, expected] of expectations) {
  const run = await runSteps(newWorkspace("read"), [read(path)]);
  check(`Read ${path} loads [${expected}]`, same(run.afterEach[1], expected), `got [${run.afterEach[1]}]`);
}

// What triggers a rule.
const editRun = await runSteps(newWorkspace("edit"), [read("src/utils/format.test.ts"), edit("src/utils/format.test.ts", "trims", "trims input")]);
check("step 4: the rule already arrives on the Read that must precede an Edit", same(editRun.afterEach[1], ["testing"]));
check("an Edit after that Read does not attach it a second time", occurrences(editRun.requests[2], IDS.testing) === occurrences(editRun.requests[1], IDS.testing), `${occurrences(editRun.requests[1], IDS.testing)} then ${occurrences(editRun.requests[2], IDS.testing)}`);

const blindEdit = await runSteps(newWorkspace("blind"), [edit("src/utils/format.test.ts", "trims", "trims input")]);
const blindText = requestText(blindEdit.requests[1]);
check("an Edit with no prior Read is refused and attaches no rule", /not been read/.test(blindText) && blindEdit.afterEach[1].length === 0);
const newFile = await runSteps(newWorkspace("write"), [write("src/new/thing.test.ts", "it('x', () => {});\n")]);
check("trap: a Write creating a new matching file attaches no rule", newFile.afterEach[1].length === 0 && /created successfully/.test(requestText(newFile.requests[1])));
const writeThenRead = await runSteps(newWorkspace("write-read"), [write("src/new/thing.test.ts", "it('x', () => {});\n"), read("src/new/thing.test.ts")]);
check("the rule arrives only on a later Read of that file", writeThenRead.afterEach[1].length === 0 && writeThenRead.afterEach[2].includes("testing"));

const twoReads = await runSteps(newWorkspace("repeat"), [read("src/utils/format.test.ts"), read("src/utils/other.spec.ts")]);
check("a second matching file does not repeat the rule's body", occurrences(twoReads.requests[2], IDS.testing) === occurrences(twoReads.requests[1], IDS.testing));

const searches = await runSteps(newWorkspace("search"), [grep("trims"), glob("**/*.test.ts")]);
check("Grep and Glob over matching files load no rule", searches.afterEach[2].length === 0 && /format\.test\.ts/.test(requestText(searches.requests[2])));
const shell = await runSteps(newWorkspace("shell"), [bash("cat src/utils/format.test.ts")]);
check("Bash cat of a matching file loads no rule, even with its contents in the result", shell.afterEach[1].length === 0 && /trims/.test(requestText(shell.requests[1])));

// Switching context in one session adds rules. Nothing is unloaded.
const switching = await runSteps(newWorkspace("switch"), [read("src/utils/format.test.ts"), read("src/api/auth.ts"), read("terraform/main.tf")]);
console.log("Rules per request while switching files:", switching.afterEach);
check("rules accumulate across a session: after three file types all three are present", same(switching.afterEach[3], ["testing", "api", "terraform"]));

// Glob base. The rule's globs are relative to the project, and the session may start elsewhere.
const subWorkspace = newWorkspace("sub");
const fromSub = await runSteps(subWorkspace, [read("src/api/auth.ts")], { cwd: join(subWorkspace.work, "src") });
check("started in src/, the rule for src/api/**/* still matches: globs resolve from the project", fromSub.afterEach[1].includes("api"));

// Frontmatter forms, one rule each, all in one workspace.
const syntax = newWorkspace("syntax");
const FORMS = {
  "inline array, one glob": { yaml: 'paths: ["**/*.one1"]', files: ["a.one1"], loads: true },
  "block list, one glob": { yaml: 'paths:\n  - "**/*.one2"', files: ["a.one2"], loads: true },
  "inline array, two globs": { yaml: 'paths: ["**/*.two1", "**/*.two2"]', files: ["a.two1", "a.two2"], loads: false },
  "block list, two globs": { yaml: 'paths:\n  - "**/*.two3"\n  - "**/*.two4"', files: ["a.two3", "a.two4"], loads: false },
  "quoted comma string, two globs": { yaml: 'paths: "**/*.ok1, **/*.ok2"', files: ["a.ok1", "a.ok2"], loads: true },
  "brace glob": { yaml: 'paths: "**/*.{ok3,ok4}"', files: ["a.ok3", "a.ok4"], loads: true },
};
const formNames = Object.keys(FORMS);
const mark = (name) => `FORM-${formNames.indexOf(name)}-MARK`;
for (const name of formNames) {
  writeWorkspaceFile(syntax.work, `.claude/rules/form-${formNames.indexOf(name)}.md`, `---\n${FORMS[name].yaml}\n---\n${mark(name)}\n`);
  for (const file of FORMS[name].files) writeWorkspaceFile(syntax.work, file, "x\n");
}
writeWorkspaceFile(syntax.work, ".claude/rules/unquoted.md", "---\npaths:\n  - **/*.bad1\n---\nFORM-UNQUOTED-YAML\n");
writeWorkspaceFile(syntax.work, ".claude/rules/wrong-key.md", '---\nglobs: ["**/*.bad2"]\n---\nFORM-WRONG-KEY\n');
writeWorkspaceFile(syntax.work, ".claude/rules/commented.md", '---\npaths: "**/*.cmt"\n---\n<!-- RULE-COMMENT -->\nFORM-COMMENTED\n');
writeWorkspaceFile(syntax.work, "a.cmt", "x\n");

const syntaxStart = await runStubbed(syntax, "hello");
const startText = requestText(syntaxStart.requests[0]);
check("a rule with a wrong key is not conditional: it loads in every session", startText.includes("FORM-WRONG-KEY"));
check("unquoted ** in a block list breaks the YAML, so that rule also loads in every session", startText.includes("FORM-UNQUOTED-YAML"));
for (const name of formNames) {
  check(`no form loads at session start: ${name}`, !startText.includes(mark(name)));
  for (const file of FORMS[name].files) {
    const run = await runSteps(syntax, [read(file)]);
    check(`${name}: Read ${file} ${FORMS[name].loads ? "loads" : "does NOT load"} the rule`, requestText(run.requests[1]).includes(mark(name)) === FORMS[name].loads);
  }
}
const commented = await runSteps(syntax, [read("a.cmt")]);
check("an HTML comment in a rule's body is not sent", requestText(commented.requests[1]).includes("FORM-COMMENTED") && !requestText(commented.requests[1]).includes("RULE-COMMENT"));

// The diagnostics. /context under -p is a fresh session, unless it resumes one.
const session = newWorkspace("context");
const contextFresh = await runStubbed(session, "/context");
check("/context in a fresh session lists no scoped rule", !/testing\.md/.test(contextFresh.text));
const touched = await runSteps(session, [read("src/utils/format.test.ts")]);
const contextAfter = await runStubbed(session, "/context", { extraArgs: ["--resume", touched.sessionId] });
check("/context on a resumed session does not list the rule the session really received", !/testing\.md/.test(contextAfter.text));
const memory = await runStubbed(session, "/memory");
check("/memory is not available under -p", /Unknown skill/.test(memory.text));

// Blueprint: same rules, no planted ids.
const blueprint = newWorkspace("blueprint", join(repoRoot, "blueprints", "path-scoped-rules"));
for (const path of ["src/a.test.ts", "src/api/b.ts", "terraform/c.tf", "src/d.ts"]) writeWorkspaceFile(blueprint.work, path, "x\n");
const blueprintTexts = {};
for (const path of ["src/a.test.ts", "src/api/b.ts", "terraform/c.tf", "src/d.ts"]) {
  const run = await runSteps(blueprint, [read(path)]);
  blueprintTexts[path] = requestText(run.requests[1]);
}
const mentions = (text) => ["describe/it blocks", "response shape", "snake_case"].filter((phrase) => text.includes(phrase));
check("blueprint: test file gets test rule only", same(mentions(blueprintTexts["src/a.test.ts"]), ["describe/it blocks"]));
check("blueprint: API file gets API rule only", same(mentions(blueprintTexts["src/api/b.ts"]), ["response shape"]));
check("blueprint: Terraform file gets Terraform rule only", same(mentions(blueprintTexts["terraform/c.tf"]), ["snake_case"]));
check("blueprint: other file gets none", mentions(blueprintTexts["src/d.ts"]).length === 0);
check("blueprint: its YAML usage comments are not sent", !blueprintTexts["src/a.test.ts"].includes("Copy to .claude/rules"));

check("no captured request holds private content", ![literalReads, start, editRun, switching, commented].some((run) => run.privateSeen));
finishChecks();
