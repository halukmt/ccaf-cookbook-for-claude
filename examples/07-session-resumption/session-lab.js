// Runs the real `claude` CLI against a throwaway copy of the fixture, with a throwaway config
// directory. Nothing here touches the fixture itself, this repo's settings or the real ~/.claude.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { childEnv, makeTempDir } from "../../_shared/agent-env.js";
import { startApiCapture } from "../../_shared/api-capture.js";
import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { MODEL } from "../../_shared/client.js";
import { copyCodebase, loadCodebase } from "../../_fixtures/codebase-answers.js";

export const CHANGED_FILES = ["auth.js", "database.js", "api-routes.js"];
const TOOLS = "Read,Glob,Grep";

export function createWorkspace() {
  const root = makeTempDir("session-lab");
  const work = join(root, "project");
  copyCodebase(join(work, "src"));
  const configDir = join(root, "config");
  return { work, configDir, src: join(work, "src") };
}

// Parses --output-format stream-json. Tool_use blocks of one response arrive as separate messages,
// so everything is collected per block and nothing assumes one tool call per message.
export function parseStream(stdout) {
  const toolUses = [];
  let result = null;
  let init = null;
  for (const line of stdout.split("\n").filter(Boolean)) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.type === "system" && message.subtype === "init") init = message;
    if (message.type === "result") result = message;
    if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "tool_use") toolUses.push({ name: block.name, input: block.input });
      }
    }
  }
  return { toolUses, result, init };
}

function textOfBlock(block) {
  if (typeof block === "string") return block;
  if (block.type === "text") return block.text;
  if (block.type === "tool_result") {
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) return block.content.map(textOfBlock).join("\n");
  }
  return "";
}

const messageText = (message) =>
  typeof message.content === "string" ? message.content : message.content.map(textOfBlock).join("\n");

// What the model was really sent on this run's first call, before it could read anything new.
export function digestFirstRequest(requests) {
  const first = requests.find((request) => (request.messages?.length ?? 0) > 0);
  if (!first) return null;

  const all = first.messages.map(messageText).join("\n");
  const toolResults = first.messages.flatMap((m) =>
    Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : []
  );
  const resultText = toolResults.map(textOfBlock).join("\n");
  const last = messageText(first.messages[first.messages.length - 1]);
  const notice = last.match(/[^\n]*(modified|changed)[^\n]*(file|since|read)[^\n]*/i)?.[0] ?? null;

  return {
    messages: first.messages.length,
    toolResults: toolResults.length,
    // Which fixture files are present as tool results, known by each file's own first line.
    filesInToolResults: [...loadCodebase()]
      .filter(([, content]) => resultText.includes(content.split("\n")[0].trim()))
      .map(([name]) => name),
    // password_hash separates auth.js from users.js, which holds the same email clause.
    oldAuthCodeInToolResults: resultText.includes("password_hash FROM users WHERE email = '"),
    newAuthCodeInToolResults: resultText.includes("password_hash FROM users WHERE email = $1"),
    changeNotice: notice,
    // The string is unique to the user's global instructions, and must not reach the model from here.
    leakedUserInstructions: hasPrivateContent(JSON.stringify(first.system ?? "")) || hasPrivateContent(all),
  };
}

// `spawn`, not `spawnSync`: the capture proxy lives in this process and must keep running.
export async function runClaude(workspace, prompt, { name, resume, fork = false, model = MODEL, capture: useCapture = true } = {}) {
  const capture = useCapture ? await startApiCapture() : null;
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--model", model,
    "--allowedTools", TOOLS,
    "--permission-mode", "dontAsk",
    "--strict-mcp-config",
    "--max-budget-usd", "1",
    ...(name ? ["--name", name] : []),
    ...(resume ? ["--resume", resume] : []),
    ...(fork ? ["--fork-session"] : []),
  ];
  const env = childEnv({
    configDir: workspace.configDir,
    extra: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      // CLI 2.1.77 sends thinking.type "enabled", which claude-sonnet-5-5 rejects with a 400.
      MAX_THINKING_TOKENS: "0",
      // A temporary config directory is not enough. The CLI walks up from the working directory, and
      // the system temp directory sits under the user's home, so it found ~/.claude/CLAUDE.md anyway.
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
      ...(capture ? { ANTHROPIC_BASE_URL: capture.url } : {}),
    },
  });

  const started = Date.now();
  const outcome = await new Promise((done, fail) => {
    const child = spawn("claude", args, { cwd: workspace.work, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 240000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", fail);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
    child.stdin.end(prompt);
  });
  if (capture) await capture.close();

  const { toolUses, result, init } = parseStream(outcome.stdout);
  const filesRead = [
    ...new Set(
      toolUses
        .filter((t) => t.name === "Read")
        .map((t) => String(t.input.file_path ?? "").replace(/\\/g, "/").split("/").pop())
    ),
  ];
  return {
    exitCode: outcome.code,
    stderr: outcome.stderr.slice(0, 500),
    stdoutTail: outcome.stdout.slice(-500),
    sessionId: result?.session_id ?? init?.session_id ?? null,
    text: typeof result?.result === "string" ? result.result : "",
    isError: result?.is_error ?? true,
    costUsd: result?.total_cost_usd ?? 0,
    turns: result?.num_turns ?? 0,
    usage: result?.usage ?? null,
    toolCount: toolUses.length,
    filesRead,
    wire: capture ? digestFirstRequest(capture.requests) : null,
    apiRequests: capture ? capture.requests.length : 0,
    durationSeconds: Math.round((Date.now() - started) / 1000),
  };
}

// Real fixes on the temporary copy. MD5 in auth.js stays on purpose: an accurate reviewer must say that
// the SQL injection is gone and that the weak hash is still there. Each edit fails loudly if it misses.
const EDITS = {
  "auth.js": [
    [
      `const sql = "SELECT id, password_hash FROM users WHERE email = '" + email + "'";\n  const { rows } = await query(sql);`,
      `const { rows } = await query("SELECT id, password_hash FROM users WHERE email = $1", [email]);`,
    ],
  ],
  "database.js": [
    [
      `  const result = await connection.query(sql, params);\n  connection.release();\n  return { rows: result.rows, rowCount: result.rowCount };`,
      `  try {\n    const result = await connection.query(sql, params);\n    return { rows: result.rows, rowCount: result.rowCount };\n  } finally {\n    connection.release();\n  }`,
    ],
  ],
  "api-routes.js": [
    [`import express from "express";`, `import express from "express";\nimport rateLimit from "express-rate-limit";`],
    [
      `router.post("/login", async`,
      `const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });\n\nrouter.post("/login", loginLimiter, async`,
    ],
    [`router.delete("/admin/users/:id", async`, `router.delete("/admin/users/:id", requireUser, async`],
  ],
};

// Tool results stored in a session's transcript file, to compare with those really re-sent on resume.
export function storedToolResults(configDir, sessionId) {
  const projects = join(configDir, "projects");
  const file = readdirSync(projects, { recursive: true }).find((f) => String(f).endsWith(`${sessionId}.jsonl`));
  if (!file) return null;
  const lines = readFileSync(join(projects, String(file)), "utf8").split("\n").filter(Boolean);
  return lines.flatMap((line) => {
    const content = JSON.parse(line).message?.content;
    return Array.isArray(content) ? content.filter((b) => b.type === "tool_result") : [];
  }).length;
}

export function applyFixes(srcDir) {
  for (const [file, edits] of Object.entries(EDITS)) {
    const path = join(srcDir, file);
    let content = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    for (const [before, after] of edits) {
      if (!content.includes(before)) throw new Error(`Fix did not apply to ${file}: ${before.slice(0, 50)}`);
      content = content.replace(before, after);
    }
    writeFileSync(path, content);
  }
}

// Sentence by sentence: does the answer say a fixed problem is still open? Coarse by design. The answers
// are saved next to this score, so a person can read them.
const FIXED_WORDS = /no longer|fixed|parameteri[sz]ed|now uses|resolved|has been|already|was addressed|gone|\$1|wrong|does not exist|is safe|finally/i;
// The earlier findings were correct for the code at that time. Calling them errors means the model
// cannot tell "I was wrong" from "the file changed".
const DISOWNS = /(claims?|statements?|report|findings?|answer)\b.{0,60}\b(wrong|incorrect|unsupported)|\bwas wrong\b|without reading|retract|take .{0,10} back/i;
const UNCHANGED_FILE = /users\.js|reports\.js|payments\.js|orders\.js|inventory\.js|notifications\.js/;
const DENIES_CHANGE = /haven'?t (edited|changed|modified)|original state|nothing has changed|has not changed/i;

function sentencesAbout(text, topic) {
  return text.split(/(?<=[.!?\n])\s+/).filter((sentence) => topic.test(sentence));
}

export function assessAnswer(text) {
  const sql = sentencesAbout(text, /sql.?injection|concatenat/i);
  const leak = sentencesAbout(text, /connection.*(leak|releas)|(leak|releas).*connection/i);
  const admin = sentencesAbout(text, /admin|delete route|rate.?limit/i);
  // A sentence about an unchanged file is not stale: users.js really still has its SQL injection.
  const staleOn = (sentences) =>
    sentences.filter((sentence) => !FIXED_WORDS.test(sentence) && !UNCHANGED_FILE.test(sentence));
  return {
    sqlMentions: sql.length,
    sqlStaleSentences: staleOn(sql),
    leakStaleSentences: staleOn(leak),
    adminStaleSentences: staleOn(admin),
    saysSqlFixed: sql.some((sentence) => FIXED_WORDS.test(sentence)),
    flagsMd5: /md5/i.test(text),
    disownsEarlierFindings: DISOWNS.test(text),
    deniesChange: DENIES_CHANGE.test(text),
  };
}
