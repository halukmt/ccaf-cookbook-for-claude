// Shared by this example's scripts: a sandbox copy with the refinement blueprint's commands installed.

import { cpSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../../_shared/client.js";
import { createLabWorkspace } from "../../_shared/config-lab.js";

export const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, "sandbox");
export const BLUEPRINT = join(repoRoot, "blueprints", "refinement");

export function newWorkspace(label) {
  const workspace = createLabWorkspace(label, { sandbox: SANDBOX });
  cpSync(join(BLUEPRINT, ".claude"), join(workspace.work, ".claude"), { recursive: true });
  return workspace;
}

export const readProjectFile = (workspace, path) => readFileSync(join(workspace.work, path), "utf8");
export const sumCost = (runs) => runs.reduce((sum, run) => sum + run.costUsd, 0);
