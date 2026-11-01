// Shared by this example's scripts: a workspace on a sandbox copy, and facts about it that do not depend on what
// the model says: a hash of the source tree, the real test results, and which files still use the old library.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLabWorkspace } from "../../_shared/config-lab.js";

export const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, "sandbox");
export const API_MARKERS = ["API-USERS-4401", "API-ORDERS-4402", "API-REPORTS-4403", "API-INVOICES-4404"];

export const newWorkspace = (label) => createLabWorkspace(label, { sandbox: SANDBOX });

function sourceFiles(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".claude") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path, root) : [relative(root, path).replace(/\\/g, "/")];
  });
}

export function hashTree(dir) {
  const hash = createHash("sha256");
  for (const file of sourceFiles(dir).sort()) {
    hash.update(file);
    hash.update(readFileSync(join(dir, file)));
  }
  return hash.digest("hex");
}

// Runs the sandbox's own tests with the real Node runner and reports each test by name.
export function runProjectTests(dir) {
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap"], { cwd: dir, encoding: "utf8" });
  const failed = [...run.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1]);
  return {
    pass: Number(run.stdout.match(/# pass (\d+)/)?.[1] ?? 0),
    fail: Number(run.stdout.match(/# fail (\d+)/)?.[1] ?? 0),
    failed,
  };
}

export const legacyImports = (dir) =>
  sourceFiles(dir).filter((file) => file.startsWith("src/") && readFileSync(join(dir, file), "utf8").includes("legacy-date"));

export const modernImports = (dir) =>
  sourceFiles(dir).filter((file) => file.startsWith("src/") && readFileSync(join(dir, file), "utf8").includes("modern-date"));

export const sumCost = (runs) => runs.reduce((sum, run) => sum + run.costUsd, 0);
export const toolNames = (run) => run.toolCalls.map((call) => call.name);
