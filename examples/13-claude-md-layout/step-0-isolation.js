// Proves the isolation every other Domain 3 script relies on, without any paid call and without the
// private file ever being sent anywhere: a planted decoy stands in for it where a leak is being shown.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { TEST_PRIVATE_MARKER } from "../../_shared/claude-cli.js";
import { repoRoot } from "../../_shared/client.js";
import {
  createLabWorkspace, findLabBase, hasPrivateContent, mainRequests, memoryFiles, requestText,
  runStubbed, startGuardedProxy, writeWorkspaceFile,
} from "../../_shared/config-lab.js";

const globalFile = join(homedir(), ".claude", "CLAUDE.md");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const globalBefore = hash(globalFile);

// The marker must still be in the real file, or a clean result below would mean nothing. Only a yes or no leaves this line.
check("the real global file still holds the marker this guard looks for", hasPrivateContent(readFileSync(globalFile, "utf8")));

const base = findLabBase();
check("the lab base directory is outside the user's home", !resolve(base).toLowerCase().startsWith(resolve(homedir()).toLowerCase()), base);
check("the system temp directory is under the home, so it cannot be used", resolve(tmpdir()).toLowerCase().startsWith(resolve(homedir()).toLowerCase()));

// 1. A normal lab run, with CLAUDE.md loading on: planted files load and the private ones do not.
const clean = createLabWorkspace("isolation");
writeWorkspaceFile(clean.work, "CLAUDE.md", "Planted project marker PLANT-PROJECT-1.\n");
writeWorkspaceFile(clean.configDir, "CLAUDE.md", "Planted user marker PLANT-USER-1.\n");
const run = await runStubbed(clean, "hello");
const first = mainRequests(run.requests)[0];
check("the CLI completed against the stub", run.exitCode === 0 && first !== undefined, `exit ${run.exitCode}`);
check("CLAUDE.md loading is really on: the project file is in the request", requestText(first).includes("PLANT-PROJECT-1"));
check("user-level loading is on, and comes from the temp config dir", requestText(first).includes("PLANT-USER-1"));
check("the private global instructions are absent from every request", !run.privateSeen, `${run.requests.length} request(s)`);
check("no loaded file lies outside the temp workspace", memoryFiles(first).every((file) => file.path.toLowerCase().startsWith(clean.root.replace(/\\/g, "/").toLowerCase())));
check("the request does not carry the real user name or home path", !JSON.stringify(run.requests).toLowerCase().includes(homedir().replace(/\\/g, "\\\\").toLowerCase()));

// 2. Negative control: why the working directory must be outside the home. A decoy in a fake home plays the private file.
const control = createLabWorkspace("isolation-control");
writeWorkspaceFile(control.home, ".claude/CLAUDE.md", "Decoy of a private file: DECOY-HOME-1.\n");
const nested = join(control.home, "somewhere", "app");
writeWorkspaceFile(nested, "CLAUDE.md", "App marker.\n");
const leaked = await runStubbed(control, "hello", { cwd: nested });
check("a working directory under a home does pick up that home's .claude/CLAUDE.md, even with another CLAUDE_CONFIG_DIR", requestText(mainRequests(leaked.requests)[0]).includes("DECOY-HOME-1"));

// 3. The guard itself. The target cannot be reached, so a pass means the body was refused before any forwarding.
const proxy = await startGuardedProxy({ target: "127.0.0.1" });
const refused = await fetch(`${proxy.url}/v1/messages`, { method: "POST", body: JSON.stringify({ system: TEST_PRIVATE_MARKER }) });
check("the guarded proxy refuses a body with a private marker", refused.status === 403 && proxy.blocked.length === 1, `HTTP ${refused.status}`);
check("the refused body is not recorded", proxy.requests.length === 0);
await proxy.close();

// 4. Nothing real changed.
check("the real global file is unchanged", hash(globalFile) === globalBefore);
check("this repo's own .claude holds no lab output", !existsSync(join(repoRoot, ".claude", "CLAUDE.md")) && !readdirSync(join(repoRoot, ".claude")).includes("rules"));

finishChecks();
