// Shared setup for this example. Everything happens in a temp project and a temp CLAUDE_CONFIG_DIR,
// so "user level" here means <temp config>/.claude.json, never the real ~/.claude.json.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliEnv, createCliWorkspace, runCli } from "../../_shared/claude-cli.js";

// Not a secret. It only has to be recognisable, so a leak into a committed file can be detected.
export const DUMMY_TOKEN = "dummy-not-a-real-token-4711";
export const dummyHash = createHash("sha256").update(DUMMY_TOKEN).digest("hex");
export const serverPath = (file) => fileURLToPath(new URL(`./${file}`, import.meta.url)).replace(/\\/g, "/");

export function projectConfig(label = "project") {
  return {
    mcpServers: {
      team: {
        command: "node",
        args: [serverPath("scope-server.js")],
        env: { CCAF_DEMO_TOKEN: "${CCAF_DEMO_TOKEN}", SERVER_LABEL: label, PROOF_FILE: "${PROOF_FILE}" },
      },
    },
  };
}

export function createLab(name) {
  const workspace = createCliWorkspace(name);
  const proofFile = join(workspace.root, "proof.jsonl");
  const mcpJson = join(workspace.work, ".mcp.json");
  const baseEnv = { CCAF_DEMO_TOKEN: DUMMY_TOKEN, PROOF_FILE: proofFile };

  return {
    workspace,
    proofFile,
    mcpJson,
    baseEnv,
    userConfigFile: join(workspace.configDir, ".claude.json"),
    writeProjectConfig(config = projectConfig()) {
      writeFileSync(mcpJson, JSON.stringify(config, null, 2));
    },
    // No prompt is sent, so these commands make no API call. `list` and `get` do start the servers.
    mcp(args, env = {}) {
      return runCli(["mcp", ...args], { cwd: workspace.work, env: cliEnv(workspace, { ...baseEnv, ...env }), timeoutMs: 60000 });
    },
    readProofs() {
      if (!existsSync(proofFile)) return [];
      return readFileSync(proofFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },
    clearProofs() {
      writeFileSync(proofFile, "");
    },
  };
}
