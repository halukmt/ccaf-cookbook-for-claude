// Isolation for anything that spawns Claude Code, through the Agent SDK or the `claude` CLI.
//
// The child gets a minimal environment with the configured key, and a throwaway config directory, so it
// neither inherits this machine's login nor reads or writes the real ~/.claude.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./client.js"; // Loads .env and fails early when the key is missing.

const KEEP = [
  "PATH", "SystemRoot", "windir", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
  "TEMP", "TMP", "HOMEDRIVE", "HOMEPATH", "ComSpec",
];

const tempDirs = [];
process.on("exit", () => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold a file briefly. The system temp directory is cleaned eventually.
    }
  }
});

// Removed again when this process exits.
export function makeTempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `ccaf-${label}-`));
  tempDirs.push(dir);
  return dir;
}

// `extra` is merged last, for example { ANTHROPIC_BASE_URL } when the traffic is being captured.
export function childEnv({ configDir = makeTempDir("config"), extra = {} } = {}) {
  const env = Object.fromEntries(
    KEEP.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])
  );
  env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API;
  env.CLAUDE_CONFIG_DIR = configDir;
  return { ...env, ...extra };
}

// `env` is left to the caller. The budget caps a runaway agent.
export const baseAgentOptions = {
  settingSources: [],
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  persistSession: false,
  maxBudgetUsd: 1,
};
