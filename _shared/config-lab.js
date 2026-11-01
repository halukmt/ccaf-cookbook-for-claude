// Tests Claude Code configuration with CLAUDE.md loading switched ON, without the user's private
// instructions ever reaching the API.
//
// claude-cli.js sets CLAUDE_CODE_DISABLE_CLAUDE_MDS=1, which is right for examples about something else
// and would defeat a test of what loads. Here three other things provide the isolation instead:
//   1. The working directory lives outside the user's home, so the walk up from it never passes ~/.claude.
//   2. HOME, USERPROFILE and the AppData variables point into the temp directory.
//   3. Every API path has a check in front of it. The stub never leaves this machine, and the guarded
//      proxy reads each body and refuses to forward it if a private marker appears.
//
// The stub is a local fake of the Messages API. A real CLI runs against it: it reads its real config,
// builds its real request and runs its real tools, and only the model is scripted. That answers "what
// loaded?" at no cost, and the body it records is the evidence.

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { hasPrivateContent, runCli, parseStreamJson } from "./claude-cli.js";
import { FAST_MODEL } from "./client.js";

export { hasPrivateContent };

// --- Where a run may live ----------------------------------------------------------------------------

function ancestors(dir) {
  const list = [];
  let current = resolve(dir);
  while (true) {
    list.push(current);
    if (current === parse(current).root) return list;
    current = dirname(current);
  }
}

// A base directory is usable only if it is writable, outside the home, and nothing on the way up holds
// instructions. The parents of this repo fail on purpose: a run must not see its files.
export function findLabBase(candidates = ["C:\\tmp", "C:\\temp", "C:\\ProgramData", "/tmp"]) {
  const home = resolve(homedir()).toLowerCase();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const chain = ancestors(candidate);
    if (chain.some((dir) => dir.toLowerCase() === home)) continue;
    if (chain.some((dir) => existsSync(join(dir, "CLAUDE.md")) || existsSync(join(dir, ".claude")))) continue;
    try {
      const probe = mkdtempSync(join(candidate, "ccaf-probe-"));
      rmSync(probe, { recursive: true, force: true });
      return candidate;
    } catch {
      // Not writable, try the next one.
    }
  }
  throw new Error("No isolated base directory found. Refusing to run with CLAUDE.md loading on.");
}

const liveRoots = [];
process.on("exit", () => {
  for (const dir of liveRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold a file briefly.
    }
  }
});

// `sandbox`, when given, is copied to project/. It is never run in place.
export function createLabWorkspace(label, { sandbox, base = findLabBase() } = {}) {
  const root = mkdtempSync(join(base, `ccaf-${label}-`));
  liveRoots.push(root);
  const work = join(root, "project");
  const configDir = join(root, "config");
  const home = join(root, "home");
  for (const dir of [work, configDir, home]) mkdirSync(dir, { recursive: true });
  if (sandbox) cpSync(sandbox, work, { recursive: true });
  return { root, work, configDir, home };
}

export function writeWorkspaceFile(dir, relativePath, content) {
  const path = join(dir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

// CLAUDE_CODE_DISABLE_CLAUDE_MDS is deliberately absent. Nothing is inherited except PATH and system variables.
export function labEnv(workspace, { apiKey, baseUrl, extra = {} }) {
  const keep = ["PATH", "SystemRoot", "windir", "TEMP", "TMP", "ComSpec", "PATHEXT"];
  const env = Object.fromEntries(keep.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  const { root } = parse(workspace.home);
  return {
    ...env,
    HOME: workspace.home,
    USERPROFILE: workspace.home,
    HOMEDRIVE: root.replace(/[\\/]$/, ""),
    HOMEPATH: workspace.home.slice(root.length - 1),
    APPDATA: join(workspace.home, "AppData", "Roaming"),
    LOCALAPPDATA: join(workspace.home, "AppData", "Local"),
    // Git must not read the real identity into the system prompt either.
    GIT_CONFIG_GLOBAL: join(workspace.home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    CLAUDE_CONFIG_DIR: workspace.configDir,
    ANTHROPIC_API_KEY: apiKey,
    ANTHROPIC_BASE_URL: baseUrl,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    // CLI 2.1.77 sends thinking.type "enabled", which current models reject with a 400.
    MAX_THINKING_TOKENS: "0",
    ...extra,
  };
}

// --- The stub API ------------------------------------------------------------------------------------

const textBlock = (text) => ({ type: "text", text });
export const toolUse = (name, input) => ({ type: "tool_use", id: `toolu_stub_${Math.random().toString(36).slice(2, 12)}`, name, input });

function sseFrames(model, content, stopReason) {
  const frames = [["message_start", {
    type: "message_start",
    message: { id: "msg_stub", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  }]];
  content.forEach((block, index) => {
    if (block.type === "text") {
      frames.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      frames.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]);
    } else {
      frames.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }]);
      frames.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } }]);
    }
    frames.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  frames.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1 } }]);
  frames.push(["message_stop", { type: "message_stop" }]);
  return frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// `script(request, index)` returns the content blocks of the reply, or a string. The default ends the turn.
export async function startStubApi({ script = () => "stub reply" } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!req.url.includes("/messages")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (req.url.includes("count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ input_tokens: 1 }));
        return;
      }
      const body = JSON.parse(raw);
      requests.push(body);
      const scripted = script(body, requests.length - 1);
      const content = typeof scripted === "string" ? [textBlock(scripted)] : scripted;
      const stopReason = content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn";
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.end(sseFrames(body.model, content, stopReason));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "msg_stub", type: "message", role: "assistant", model: body.model, content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((done) => { server.closeAllConnections(); server.close(done); }),
  };
}

// --- The guarded proxy -------------------------------------------------------------------------------

// Like api-capture.js, with one difference that matters here: the body is checked before it is forwarded.
// A request holding a private marker is refused and never leaves the machine.
export async function startGuardedProxy({ target = "api.anthropic.com" } = {}) {
  const requests = [];
  const blocked = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const text = body.toString("utf8");
      if (hasPrivateContent(text)) {
        blocked.push(req.url);
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "permission_error", message: "Blocked by the lab guard: private content in request." } }));
        return;
      }
      if (req.url.includes("/messages") && !req.url.includes("count_tokens")) {
        try {
          requests.push(JSON.parse(text));
        } catch {
          // Forwarded unrecorded.
        }
      }
      const upstream = httpsRequest({ host: target, path: req.url, method: req.method, headers: { ...req.headers, host: target } }, (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      });
      upstream.on("error", (error) => {
        res.writeHead(502);
        res.end(error.message);
      });
      upstream.end(body);
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    blocked,
    close: () => new Promise((done) => { server.closeAllConnections(); server.close(done); }),
  };
}

// --- Running the CLI ---------------------------------------------------------------------------------

function cliArgs({ model, allowedTools, tools, disallowedTools, permissionMode, budgetUsd, outputFormat, extraArgs }) {
  return [
    "-p",
    "--output-format", outputFormat,
    ...(outputFormat === "stream-json" ? ["--verbose"] : []),
    "--model", model,
    "--permission-mode", permissionMode,
    ...(budgetUsd ? ["--max-budget-usd", String(budgetUsd)] : []),
    ...(allowedTools ? ["--allowedTools", allowedTools] : []),
    ...(disallowedTools ? ["--disallowedTools", disallowedTools] : []),
    ...(tools !== undefined ? ["--tools", tools] : []),
    "--strict-mcp-config",
    ...extraArgs,
  ];
}

const DEFAULTS = { model: FAST_MODEL, permissionMode: "dontAsk", budgetUsd: 0, outputFormat: "stream-json", extraArgs: [], env: {} };

function summarise(outcome, started) {
  const { init, result, toolCalls } = parseStreamJson(outcome.stdout);
  return {
    exitCode: outcome.code,
    stdout: outcome.stdout,
    stderr: outcome.stderr.slice(0, 800),
    init,
    result,
    toolCalls,
    sessionId: result?.session_id ?? init?.session_id ?? null,
    text: typeof result?.result === "string" ? result.result : "",
    isError: result?.is_error ?? true,
    costUsd: result?.total_cost_usd ?? 0,
    turns: result?.num_turns ?? 0,
    usage: result?.usage ?? null,
    durationSeconds: Math.round((Date.now() - started) / 1000),
  };
}

// Free. A dead proxy catches anything that ignores ANTHROPIC_BASE_URL, and the key is a dummy.
export async function runStubbed(workspace, prompt, { script, cwd = workspace.work, ...options } = {}) {
  const settings = { ...DEFAULTS, ...options };
  const api = await startStubApi({ script });
  const env = labEnv(workspace, {
    apiKey: "sk-ant-stub-not-a-real-key",
    baseUrl: api.url,
    extra: { HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost", ...settings.env },
  });
  const started = Date.now();
  const outcome = await runCli(cliArgs(settings), { cwd, env, input: prompt, timeoutMs: options.timeoutMs ?? 120000 });
  await api.close();
  return { ...summarise(outcome, started), requests: api.requests, privateSeen: hasPrivateContent(JSON.stringify(api.requests)) };
}

// Paid. Runs only behind the guard. A preflight through the stub must already show a clean first request.
// Pass preflight: false only for a --resume, where a stub reply would land in the session being resumed.
// The guarded proxy still checks every body in that case.
export async function runGuarded(workspace, prompt, { cwd = workspace.work, preflight: runPreflight = true, ...options } = {}) {
  const settings = { ...DEFAULTS, budgetUsd: 1, ...options };
  if (runPreflight) {
    // Only the first request matters here. Without the schema flag: a stub's plain reply would be retried without end.
    const schemaAt = settings.extraArgs.indexOf("--json-schema");
    const extraArgs = schemaAt === -1 ? settings.extraArgs : settings.extraArgs.filter((_, index) => index !== schemaAt && index !== schemaAt + 1);
    const preflight = await runStubbed(workspace, prompt, { cwd, ...settings, extraArgs });
    if (preflight.requests.length === 0) throw new Error(`Preflight sent no request. stderr: ${preflight.stderr}`);
    if (preflight.privateSeen) throw new Error("Preflight found private content. Nothing was sent to the API.");
  }

  const proxy = await startGuardedProxy();
  const env = labEnv(workspace, { apiKey: process.env.ANTHROPIC_API, baseUrl: proxy.url, extra: settings.env });
  const started = Date.now();
  const outcome = await runCli(cliArgs(settings), { cwd, env, input: prompt, timeoutMs: options.timeoutMs ?? 240000 });
  await proxy.close();
  return { ...summarise(outcome, started), requests: proxy.requests, blocked: proxy.blocked.length, privateSeen: hasPrivateContent(JSON.stringify(proxy.requests)) };
}

// --- Reading a captured request ----------------------------------------------------------------------

export function blockText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (typeof block === "string") return block;
    if (block.type === "text") return block.text;
    if (block.type === "tool_result") return blockText(block.content);
    return "";
  }).join("\n");
}

export const requestText = (request) =>
  [blockText(request.system), ...(request.messages ?? []).map((message) => blockText(message.content))].join("\n");

// The main conversation's calls have tools. Short helper calls the CLI makes on the side do not.
export const mainRequests = (requests) => requests.filter((request) => (request.tools?.length ?? 0) > 0);

// The memory files the CLI announces in its context block, each with the label it gave that file.
export function memoryFiles(request) {
  const text = requestText(request);
  return [...text.matchAll(/^Contents of (.+?) \(([^)]*)\):$/gm)].map((match) => ({ path: match[1].replace(/\\/g, "/"), label: match[2] }));
}

export const projectRelative = (workspace, path) => {
  const prefix = workspace.work.replace(/\\/g, "/").toLowerCase();
  const normalised = path.replace(/\\/g, "/");
  return normalised.toLowerCase().startsWith(prefix) ? normalised.slice(prefix.length + 1) : normalised;
};
