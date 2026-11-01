// Shared by this example's scripts: a scripted model that touches files, and a reading of which rules arrived.

import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLabWorkspace, requestText, runStubbed, toolUse, writeWorkspaceFile } from "../../_shared/config-lab.js";

export const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, "sandbox");
export const LIST_FORM = join(here, "sandbox-list-form");
export const IDS = { testing: "RULE-TESTING-3301", api: "RULE-API-3302", terraform: "RULE-TERRAFORM-3303" };

export const newWorkspace = (label, source = SANDBOX) => createLabWorkspace(label, { sandbox: source });

// Which rules are in a captured request, by planted id.
export function rulesIn(request) {
  const text = requestText(request);
  return Object.entries(IDS).filter(([, id]) => text.includes(id)).map(([name]) => name);
}

// Runs a scripted sequence of tool calls, then ends the turn. Each step builds its tool call from the workspace.
export async function runSteps(workspace, steps, options = {}) {
  const run = await runStubbed(workspace, "Work through the task.", {
    allowedTools: "Read,Edit,Write,Grep,Glob,Bash",
    script: (_, index) => (index < steps.length ? [steps[index](workspace)] : "done"),
    ...options,
  });
  return { ...run, afterEach: run.requests.map(rulesIn) };
}

const inProject = (workspace, path) => join(workspace.work, ...path.split("/"));
export const read = (path) => (workspace) => toolUse("Read", { file_path: inProject(workspace, path) });
export const write = (path, content) => (workspace) => toolUse("Write", { file_path: inProject(workspace, path), content });
export const edit = (path, before, after) => (workspace) => toolUse("Edit", { file_path: inProject(workspace, path), old_string: before, new_string: after });
export const grep = (pattern) => () => toolUse("Grep", { pattern });
export const glob = (pattern) => () => toolUse("Glob", { pattern });
export const bash = (command) => () => toolUse("Bash", { command });

// The comparison setup: the bodies of all three rules moved into one always-loaded file.
export function allInRootWorkspace(label) {
  const workspace = createLabWorkspace(label, { sandbox: SANDBOX });
  const bodies = ["testing", "api-conventions", "terraform"].map((name) => {
    const text = readFileSync(join(SANDBOX, ".claude", "rules", `${name}.md`), "utf8").replace(/\r\n/g, "\n");
    return text.replace(/^---\n[\s\S]*?\n---\n/, "");
  });
  rmSync(join(workspace.work, ".claude", "rules"), { recursive: true, force: true });
  writeWorkspaceFile(workspace.work, "CLAUDE.md", bodies.join("\n"));
  return workspace;
}
