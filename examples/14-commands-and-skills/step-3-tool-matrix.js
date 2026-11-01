// Step 3, free: does frontmatter restrict tools, or only pre-approve them? A scripted model tries Read, Write
// and Bash from inside a forked skill, so the result is the CLI's decision and not the model's manners.
// `existsSync` on the files they create is the final word.

import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toolResultsSent } from "../../_shared/api-capture.js";
import { check, finishChecks } from "../../_shared/check.js";
import { repoRoot } from "../../_shared/client.js";
import { blockText, createLabWorkspace, runStubbed, toolUse, writeWorkspaceFile as write } from "../../_shared/config-lab.js";

const ALLOWED = "allowed-tools:\n  - Read\n  - Grep\n  - Glob";

function skill(frontmatter) {
  return `---\ndescription: test\ncontext: fork\n${frontmatter}\n---\nRead-only analysis.\n`;
}

const CASES = {
  "allowed-tools only": { frontmatter: ALLOWED },
  "disallowed-tools (kebab)": { frontmatter: `${ALLOWED}\ndisallowed-tools: Write, Bash` },
  "disallowedTools (camel)": { frontmatter: `${ALLOWED}\ndisallowedTools: Write, Bash` },
  "agent: Explore": { frontmatter: `${ALLOWED}\nagent: Explore` },
  "allowed-tools + settings deny": { frontmatter: ALLOWED, settings: { permissions: { deny: ["Write", "Edit", "Bash"] } } },
  "allowed-tools + --disallowedTools": { frontmatter: ALLOWED, disallowedTools: "Write,Edit,Bash" },
};

async function attempt(name, testCase, mode, { skillFile } = {}) {
  const workspace = createLabWorkspace("matrix");
  const invoke = skillFile ? skillFile.command : "/s";
  if (skillFile) skillFile.install(workspace);
  else write(workspace.work, ".claude/skills/s/SKILL.md", skill(testCase.frontmatter));
  if (testCase.settings) write(workspace.work, ".claude/settings.json", JSON.stringify(testCase.settings));
  write(workspace.work, "f.txt", "readable\n");
  const script = (_, index) => {
    if (index === 0) return [toolUse("Read", { file_path: join(workspace.work, "f.txt") })];
    if (index === 1) return [toolUse("Write", { file_path: join(workspace.work, "by-write.txt"), content: "x" })];
    if (index === 2) return [toolUse("Bash", { command: "echo x > by-bash.txt" })];
    return "done";
  };
  const run = await runStubbed(workspace, invoke, {
    script,
    permissionMode: mode,
    disallowedTools: testCase.disallowedTools,
    extraArgs: mode === "bypassPermissions" ? ["--dangerously-skip-permissions"] : [],
  });
  const results = toolResultsSent(run.requests);
  const row = {
    case: name,
    mode,
    offered: run.requests[0].tools.map((tool) => tool.name),
    read: results.find((result) => result.toolName === "Read")?.isError === false,
    wrote: existsSync(join(workspace.work, "by-write.txt")),
    bashRan: existsSync(join(workspace.work, "by-bash.txt")),
    privateSeen: run.privateSeen,
    forked: !blockText(run.requests[0].system).includes("interactive agent"),
  };
  console.log(`${name.padEnd(36)} ${mode.padEnd(18)} offersWrite=${row.offered.includes("Write")} offersBash=${row.offered.includes("Bash")} read=${row.read} wrote=${row.wrote} bash=${row.bashRan}`);
  return row;
}

const rows = {};
for (const [name, testCase] of Object.entries(CASES)) {
  for (const mode of ["dontAsk", "bypassPermissions"]) rows[`${name}|${mode}`] = await attempt(name, testCase, mode);
}
const row = (name, mode) => rows[`${name}|${mode}`];

const plain = "allowed-tools only";
check("allowed-tools does not change the tools offered: Write and Bash are still in the request", row(plain, "dontAsk").offered.includes("Write") && row(plain, "dontAsk").offered.includes("Bash"));
check("allowed-tools pre-approves: Read runs under dontAsk with no CLI-level allow", row(plain, "dontAsk").read);
check("under dontAsk the unlisted tools are refused, by that mode", !row(plain, "dontAsk").wrote && !row(plain, "dontAsk").bashRan);
check("allowed-tools is not a boundary: under bypass, Write and Bash really ran", row(plain, "bypassPermissions").wrote && row(plain, "bypassPermissions").bashRan);
for (const name of ["disallowed-tools (kebab)", "disallowedTools (camel)"]) {
  check(`${name} in skill frontmatter has no effect here: Write and Bash ran under bypass`, row(name, "bypassPermissions").wrote && row(name, "bypassPermissions").bashRan && row(name, "bypassPermissions").offered.includes("Write"));
}
check("agent: Explore removes Write from the offer", !row("agent: Explore", "dontAsk").offered.includes("Write") && !row("agent: Explore", "bypassPermissions").wrote);
check("agent: Explore still offers Bash, and under bypass it can write with it", row("agent: Explore", "bypassPermissions").offered.includes("Bash") && row("agent: Explore", "bypassPermissions").bashRan);
const denied = row("allowed-tools + settings deny", "bypassPermissions");
check("a deny rule in settings holds even under bypass", !denied.wrote && !denied.bashRan && denied.read);
const flag = row("allowed-tools + --disallowedTools", "bypassPermissions");
check("--disallowedTools removes the tools from the offer and holds under bypass", !flag.offered.includes("Write") && !flag.wrote && !flag.bashRan && flag.read);

// The blueprint: a skill plus the settings that make it really read-only for this session type.
const BLUEPRINT = join(repoRoot, "blueprints", "commands-and-skills");
const installed = { command: "/explore-area src/api", install: (workspace) => cpSync(BLUEPRINT, workspace.work, { recursive: true }) };
const blueprintDefault = await attempt("blueprint explore-area", {}, "dontAsk", { skillFile: installed });
const blueprintBypass = await attempt("blueprint explore-area", {}, "bypassPermissions", { skillFile: installed });
check("blueprint skill forks", blueprintDefault.forked);
check("blueprint skill reads without approval under dontAsk", blueprintDefault.read);
check("blueprint skill cannot write under dontAsk", !blueprintDefault.wrote && !blueprintDefault.bashRan);
check("blueprint skill's agent removes Write even under bypass", !blueprintBypass.wrote && !blueprintBypass.offered.includes("Write"));

check("no captured request holds private content", !Object.values(rows).some((entry) => entry.privateSeen));
finishChecks();
