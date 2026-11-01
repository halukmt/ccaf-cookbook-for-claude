// Builds the step 6 situation in temp directories: one committed repo, two clones, two config dirs.
// The first developer has moved one convention out of the project file into their own user-level file.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLabWorkspace, writeWorkspaceFile } from "../../_shared/config-lab.js";

export const CONVENTION_ID = "CONV-VERBOSE-8823";
export const PROJECT_ID = "STD-PROJECT-4471";
export const MOVED_LINE = `- Always use verbose variable names (convention id: ${CONVENTION_ID}).`;

function git(cwd, ...args) {
  const run = spawnSync("git", ["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout;
}

export function prepareTwoDevelopers(exampleDir) {
  const alice = createLabWorkspace("alice", { sandbox: join(exampleDir, "sandbox") });
  const projectFile = join(alice.work, ".claude", "CLAUDE.md");
  const content = readFileSync(projectFile, "utf8").replace(/\r\n/g, "\n");
  if (!content.includes(MOVED_LINE)) throw new Error("The convention to move is not in the sandbox file.");
  writeFileSync(projectFile, content.replace(MOVED_LINE + "\n", ""));
  writeWorkspaceFile(alice.configDir, "CLAUDE.md", `# Personal Preferences\n\n${MOVED_LINE}\n`);

  git(alice.work, "init", "-q");
  git(alice.work, "add", "-A");
  git(alice.work, "commit", "-q", "-m", "standards");

  // A clone, not a copy, so the second developer has exactly what git carries.
  const bob = createLabWorkspace("bob");
  git(bob.root, "clone", "-q", alice.work, "clone");
  return { alice, bob: { ...bob, work: join(bob.root, "clone") } };
}
