// Runs the real `claude` CLI in isolation, for examples about the CLI itself. A temp working directory,
// a temp CLAUDE_CONFIG_DIR, no CLAUDE.md loading, and the key only in the child's environment.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { childEnv, makeTempDir } from "./agent-env.js";
import { startApiCapture, toolResultsSent } from "./api-capture.js";
import { FAST_MODEL } from "./client.js";

export function createCliWorkspace(label) {
  const root = makeTempDir(label);
  const work = join(root, "project");
  const configDir = join(root, "config");
  mkdirSync(work, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  return { root, work, configDir };
}

export function cliEnv(workspace, extra = {}) {
  return childEnv({
    configDir: workspace.configDir,
    extra: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      // CLI 2.1.77 sends thinking.type "enabled", which claude-sonnet-5-5 rejects with a 400.
      MAX_THINKING_TOKENS: "0",
      // A temp config directory is not enough: the CLI walks up from the working directory, and the
      // system temp directory sits under the user's home, so it would find ~/.claude/CLAUDE.md.
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
      ...extra,
    },
  });
}

export function runCli(args, { cwd, env, input = "", timeoutMs = 240000 }) {
  return new Promise((done, fail) => {
    const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", fail);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function blockText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? "").join("\n");
  return "";
}

// Pairs each tool_use with its tool_result, so a caller can see what really ran and what it returned.
export function parseStreamJson(stdout) {
  const calls = new Map();
  let init = null;
  let result = null;
  for (const line of stdout.split("\n").filter(Boolean)) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.type === "system" && message.subtype === "init") init = message;
    if (message.type === "result") result = message;
    for (const block of Array.isArray(message.message?.content) ? message.message.content : []) {
      if (block.type === "tool_use") calls.set(block.id, { name: block.name, input: block.input, isError: false, resultText: null });
      if (block.type === "tool_result" && calls.has(block.tool_use_id)) {
        const call = calls.get(block.tool_use_id);
        call.isError = Boolean(block.is_error);
        call.resultText = blockText(block.content);
      }
    }
  }
  return { init, result, toolCalls: [...calls.values()] };
}

// Facts about isolation, from the request bodies really sent. The markers are lines of the running
// user's real ~/.claude/CLAUDE.md, so none of them may ever appear in a request. The file is only
// read for this comparison. TEST_PRIVATE_MARKER lets a script prove the check itself works.
export const TEST_PRIVATE_MARKER = "PRIVATE-INSTRUCTIONS-TEST-MARKER";

function privateMarkers() {
  let text = "";
  try {
    text = readFileSync(join(homedir(), ".claude", "CLAUDE.md"), "utf8");
  } catch {
    // No personal instructions on this machine, so only the test marker applies.
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#\s-]+/, "").trim())
    .filter((line) => /^[\w .,:-]{20,}$/.test(line));
  return [TEST_PRIVATE_MARKER, ...lines];
}

export const hasPrivateContent = (text) => privateMarkers().some((marker) => text.includes(marker));

export function isolationReport(requests) {
  return { requests: requests.length, privateInstructionsSent: hasPrivateContent(JSON.stringify(requests)) };
}

// One `claude -p` run through the capture proxy. Pass `allowedTools` as a comma-separated string.
export async function runPrompt(workspace, prompt, { model = FAST_MODEL, allowedTools, budgetUsd = 1, extraArgs = [], env = {} } = {}) {
  const capture = await startApiCapture();
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--model", model,
    "--permission-mode", "dontAsk",
    "--max-budget-usd", String(budgetUsd),
    ...(allowedTools ? ["--allowedTools", allowedTools] : []),
    ...extraArgs,
  ];
  const started = Date.now();
  const outcome = await runCli(args, {
    cwd: workspace.work,
    env: cliEnv(workspace, { ANTHROPIC_BASE_URL: capture.url, ...env }),
    input: prompt,
  });
  await capture.close();
  const { init, result, toolCalls } = parseStreamJson(outcome.stdout);
  return {
    exitCode: outcome.code,
    stderr: outcome.stderr.slice(0, 500),
    init,
    toolCalls,
    text: typeof result?.result === "string" ? result.result : "",
    isError: result?.is_error ?? true,
    costUsd: result?.total_cost_usd ?? 0,
    turns: result?.num_turns ?? 0,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    requests: capture.requests,
    toolResults: toolResultsSent(capture.requests),
    isolation: isolationReport(capture.requests),
  };
}
