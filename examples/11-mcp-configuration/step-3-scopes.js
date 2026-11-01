// Free: what each scope really writes, and which one wins when a name exists in several. All against the
// temp CLAUDE_CONFIG_DIR. Which scope wins is read from the server itself, not only from the CLI's text.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { createLab, dummyHash, serverPath } from "./mcp-lab.js";

const MARKER = "ccaf-scope-probe-personal";
const lab = createLab("scopes");
lab.writeProjectConfig();
const projectText = readFileSync(lab.mcpJson, "utf8");
const server = serverPath("scope-server.js");
const readConfig = () => JSON.parse(readFileSync(lab.userConfigFile, "utf8"));

async function winner() {
  lab.clearProofs();
  const got = await lab.mcp(["get", "team"]);
  const scope = got.stdout.match(/Scope: (\w+)/)?.[1] ?? null;
  return { scope, label: lab.readProofs().at(-1)?.label ?? null };
}

// A personal server with a variable reference, at user level.
const personal = JSON.stringify({ type: "stdio", command: "node", args: [server], env: { CCAF_DEMO_TOKEN: "${CCAF_DEMO_TOKEN}", SERVER_LABEL: "user", PROOF_FILE: "${PROOF_FILE}" } });
const added = await lab.mcp(["add-json", "--scope", "user", MARKER, personal]);
console.log(added.stdout.trim());
check("add-json at user scope succeeded", added.code === 0);
check("It wrote <config dir>/.claude.json", existsSync(lab.userConfigFile));
check("The entry is in top-level mcpServers", Boolean(readConfig().mcpServers?.[MARKER]));
check("The reference stays literal on disk", readConfig().mcpServers[MARKER].env.CCAF_DEMO_TOKEN === "${CCAF_DEMO_TOKEN}");

lab.clearProofs();
const listed = await lab.mcp(["list"]);
console.log(listed.stdout);
check("Project and user servers are both listed and connected", new RegExp(`${MARKER}:.*Connected`).test(listed.stdout) && /team:.*Connected/.test(listed.stdout));
const proofs = lab.readProofs();
check("Expansion also works at user level", proofs.some((p) => p.label === "user" && p.tokenSha256 === dummyHash));
check("The project file was not touched by a user-level add", readFileSync(lab.mcpJson, "utf8") === projectText);

// The same name in several scopes.
const entry = (label) => JSON.stringify({ type: "stdio", command: "node", args: [server], env: { SERVER_LABEL: label, PROOF_FILE: "${PROOF_FILE}" } });

const projectOnly = await winner();
console.log("team in project only:", projectOnly);
check("Project alone: project runs", projectOnly.label === "project");

await lab.mcp(["add-json", "--scope", "user", "team", entry("user-team")]);
const projectAndUser = await winner();
console.log("team in project and user:", projectAndUser);
check("Project beats user", projectAndUser.label === "project" && projectAndUser.scope === "Project");

await lab.mcp(["add-json", "--scope", "local", "team", entry("local-team")]);
const allThree = await winner();
console.log("team in project, user and local:", allThree);
check("Local beats project", allThree.label === "local-team" && allThree.scope === "Local");

const config = readConfig();
const projectKey = Object.keys(config.projects).find((key) => config.projects[key].mcpServers?.team);
console.log("Local entry stored under:", projectKey);
check("Local scope is stored in the same file, per project path", Boolean(projectKey));
check("Local scope did not touch .mcp.json", readFileSync(lab.mcpJson, "utf8") === projectText);

await lab.mcp(["remove", "team", "-s", "local"]);
const afterRemove = await winner();
console.log("after removing local:", afterRemove);
check("Removing local falls back to project", afterRemove.label === "project");

await lab.mcp(["add-json", "--scope", "project", "added-to-project", entry("project-2")]);
check("Project scope writes to .mcp.json", Boolean(JSON.parse(readFileSync(lab.mcpJson, "utf8")).mcpServers["added-to-project"]));

const DEFAULT_MARKER = "ccaf-scope-probe-default";
const defaultAdd = await lab.mcp(["add", DEFAULT_MARKER, "--", "node", server]);
check("With no --scope flag, add defaults to local", defaultAdd.stdout.includes("local config"));

// Isolation: searches for a marker only, and prints nothing from the real file.
const real = join(homedir(), ".claude.json");
const realText = existsSync(real) ? readFileSync(real, "utf8") : "";
const realHasMarker = realText.includes(MARKER) || realText.includes(DEFAULT_MARKER);
check("The real ~/.claude.json was not touched", !realHasMarker);

finishChecks();
