// Free: .mcp.json loading and ${VAR} expansion, proved with a local server and a dummy value.
// The community GitHub file next to this script is only parsed. It is not run: no token exists here,
// and its npm package is deprecated, so choose a maintained server in a real project.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { createLab, DUMMY_TOKEN, dummyHash, projectConfig } from "./mcp-lab.js";

const community = JSON.parse(readFileSync(new URL("./community-github.mcp.json", import.meta.url), "utf8")).mcpServers.github;
check("Community example has command and args", community.command === "npx" && community.args.includes("-y"));
check("Community example holds only a variable reference", community.env.GITHUB_TOKEN === "${GITHUB_TOKEN}");

const lab = createLab("project-config");
lab.writeProjectConfig();
const fileText = readFileSync(lab.mcpJson, "utf8");
console.log(fileText);
check("The project file holds the literal reference", fileText.includes('"${CCAF_DEMO_TOKEN}"'));
check("The project file does not hold the value", !fileText.includes(DUMMY_TOKEN));

const git = (...args) => execFileSync("git", args, { cwd: lab.workspace.work, encoding: "utf8" });
git("init", "-q");
git("add", ".mcp.json");
const staged = git("diff", "--cached");
check("The staged diff contains the reference and no value", staged.includes("${CCAF_DEMO_TOKEN}") && !staged.includes(DUMMY_TOKEN));

// Variable set.
const listed = await lab.mcp(["list"]);
console.log(listed.stdout);
check("`mcp list` finds and connects the project server", /team:.*Connected/.test(listed.stdout));
const got = await lab.mcp(["get", "team"]);
check("`mcp get` reports project scope", /Scope: Project config/.test(got.stdout));
const proof = lab.readProofs().at(-1);
console.log("Server proof:", proof);
check("The server really started and read its label", proof?.label === "project");
check("The server received the value, not the literal", proof?.tokenSha256 === dummyHash && proof.tokenIsUnexpandedLiteral === false);
check("The file on disk is unchanged after loading", readFileSync(lab.mcpJson, "utf8") === fileText);

// Variable unset: what really happens, recorded.
lab.clearProofs();
const unset = await lab.mcp(["list"], { CCAF_DEMO_TOKEN: undefined });
const unsetProof = lab.readProofs().at(-1) ?? null;
console.log("\nVariable unset:", { exit: unset.code, stdout: unset.stdout.trim(), stderr: unset.stderr.trim().slice(0, 300), proof: unsetProof });
check("CLI 2.1.77: with the variable unset, the server still starts", /Connected/.test(unset.stdout) && unsetProof !== null);
check("CLI 2.1.77: it receives the unexpanded literal", unsetProof?.tokenIsUnexpandedLiteral === true);

// Default syntax.
const withDefault = projectConfig();
withDefault.mcpServers.team.env.CCAF_DEMO_TOKEN = "${CCAF_DEMO_TOKEN:-fallback}";
lab.writeProjectConfig(withDefault);
lab.clearProofs();
await lab.mcp(["list"], { CCAF_DEMO_TOKEN: undefined });
const defaulted = lab.readProofs().at(-1);
console.log("Default syntax, variable unset:", defaulted);
check("${VAR:-default} supplies the default when unset", defaulted?.tokenPresent === true && defaulted.tokenIsUnexpandedLiteral === false && defaulted.tokenSha256 !== dummyHash);

finishChecks();
