// Shared setup for this example's scripts. The sandbox is the repository. sandbox-user/ plays one person's
// ~/.claude and is only ever copied into a temp config directory.

import { spawnSync } from "node:child_process";
import { cpSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blockText, createLabWorkspace, toolUse, writeWorkspaceFile } from "../../_shared/config-lab.js";

export const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, "sandbox");
export const USER_LEVEL = join(here, "sandbox-user");
export const API_FILES = ["users.js", "orders.js", "payments.js"];
export const VERBOSE_MARKERS = ["VERBOSE-USERS-1101", "VERBOSE-ORDERS-1102", "VERBOSE-PAYMENTS-1103"];
export const SUMMARY_MARKER = "SUMMARY-ONLY-5150";

export function createDeveloper(label, { withUserSkill = false } = {}) {
  const workspace = createLabWorkspace(label, { sandbox: SANDBOX });
  if (withUserSkill) cpSync(USER_LEVEL, workspace.configDir, { recursive: true });
  return workspace;
}

// A real clone: the second developer holds exactly what git carries.
export function cloneFor(source, label) {
  const git = (cwd, ...args) => {
    const run = spawnSync("git", ["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", ...args], { cwd, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout;
  };
  git(source.work, "init", "-q");
  git(source.work, "add", "-A");
  git(source.work, "commit", "-q", "-m", "project");
  const clone = createLabWorkspace(label);
  git(clone.root, "clone", "-q", source.work, "clone");
  return { ...clone, work: join(clone.root, "clone"), tracked: git(source.work, "ls-files").split("\n") };
}

// The prompt itself is the last text block of the first user message. The listing and context come before it.
export function promptBlock(request) {
  const content = request.messages[0].content;
  return typeof content === "string" ? content : content[content.length - 1].text;
}

export const isForkRequest = (request) => !blockText(request.system).includes("interactive agent");

export function inlineCopyOfSkill(workspace) {
  const path = join(workspace.configDir, "skills", "brainstorm", "SKILL.md");
  const content = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (!content.includes("context: fork\n")) throw new Error("The skill has no context: fork line to remove.");
  writeWorkspaceFile(workspace.configDir, "skills/brainstorm/SKILL.md", content.replace("context: fork\n", ""));
}

// A scripted model that reads every file in the area, then answers. It treats main and fork the same way.
export function readAreaScript(workspace) {
  let reads = 0;
  return () => {
    if (reads < API_FILES.length) return [toolUse("Read", { file_path: join(workspace.work, "src", "api", API_FILES[reads++]) })];
    return `${SUMMARY_MARKER}: three modules, same shape repeated forty times.`;
  };
}
