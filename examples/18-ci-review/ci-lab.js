// Shared by this example's scripts: a temp git repository standing in for a checkout on a CI runner, and the
// blueprint's pipeline run as a real child process. Nothing here pushes or posts.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../../_shared/client.js";
import { createLabWorkspace, labEnv, runStubbed, startGuardedProxy, startStubApi } from "../../_shared/config-lab.js";

export const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, "sandbox");
export const PIPELINE = join(repoRoot, "blueprints", "ci-review", "scripts", "ci-review.js");
export const CI_SECTION_MARK = "Testing Standards (CI Context)";

export function git(cwd, ...args) {
  const run = spawnSync("git", ["-c", "user.name=lab", "-c", "user.email=lab@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

export function newRepo(label) {
  const workspace = createLabWorkspace(label, { sandbox: SANDBOX });
  git(workspace.work, "init", "-q", "-b", "main");
  git(workspace.work, "add", "-A");
  git(workspace.work, "commit", "-q", "-m", "base");
  git(workspace.work, "checkout", "-q", "-b", "pr");
  return workspace;
}

// Applies one "push" of the pull request as a commit.
export function push(workspace, number) {
  cpSync(join(here, `pr-push-${number}`), workspace.work, { recursive: true });
  git(workspace.work, "add", "-A");
  git(workspace.work, "commit", "-q", "-m", `push ${number}`);
  return git(workspace.work, "rev-parse", "HEAD");
}

export function removeProjectInstructions(workspace) {
  rmSync(join(workspace.work, ".claude"), { recursive: true, force: true });
  git(workspace.work, "add", "-A");
  git(workspace.work, "commit", "-q", "-m", "no instructions");
}

// A `gh` on PATH that only records being called. A dry run must leave its log empty.
export function installGhTrap(workspace) {
  const dir = join(workspace.root, "gh-trap");
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "gh-calls.log");
  writeFileSync(join(dir, "gh.cmd"), `@echo called>>"${log}"\r\n`);
  writeFileSync(join(dir, "gh"), `#!/bin/sh\necho called >> "${log}"\n`, { mode: 0o755 });
  return { dir, log };
}

function spawnPipeline(args, { cwd, env }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [PIPELINE, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

export function lastJsonLine(stdout) {
  const line = stdout.trim().split("\n").filter((text) => text.startsWith("{") && text.includes('"summary"')).at(-1);
  return line ? JSON.parse(line) : null;
}

// Free: the pipeline against the stub. `script` plays the model.
export async function runPipelineStubbed(workspace, args, { script, extraPath } = {}) {
  const api = await startStubApi({ script });
  const env = labEnv(workspace, { apiKey: "sk-ant-stub-not-a-real-key", baseUrl: api.url, extra: { HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost" } });
  if (extraPath) env.PATH = `${extraPath};${env.PATH}`;
  const outcome = await spawnPipeline(args, { cwd: workspace.work, env });
  await api.close();
  return { ...outcome, requests: api.requests, summary: lastJsonLine(outcome.stdout) };
}

// Paid: behind the guard, which refuses any body holding private content.
export async function runPipelineGuarded(workspace, args, { extraPath } = {}) {
  const preflight = await runStubbed(workspace, "hello");
  if (preflight.requests.length === 0 || preflight.privateSeen) throw new Error("Preflight failed. Nothing was sent to the API.");
  const proxy = await startGuardedProxy();
  const env = labEnv(workspace, { apiKey: process.env.ANTHROPIC_API, baseUrl: proxy.url });
  if (extraPath) env.PATH = `${extraPath};${env.PATH}`;
  const outcome = await spawnPipeline(args, { cwd: workspace.work, env });
  await proxy.close();
  return { ...outcome, requests: proxy.requests, blocked: proxy.blocked.length, summary: lastJsonLine(outcome.stdout) };
}

// The dry run's output as data: [{ command, payload }].
export function parseDryRun(stdout) {
  const lines = stdout.split("\n");
  const calls = [];
  lines.forEach((line, index) => {
    if (!line.startsWith("DRY RUN: gh ")) return;
    const end = lines.findIndex((text, position) => position > index && text === "}");
    calls.push({ command: line.slice("DRY RUN: ".length), payload: JSON.parse(lines.slice(index + 1, end + 1).join("\n")) });
  });
  return calls;
}
