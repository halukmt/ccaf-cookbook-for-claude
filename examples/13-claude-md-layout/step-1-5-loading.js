// Steps 1 to 5, free: a real CLI against the local stub. `/context` works in print mode here, so it is
// compared with the request body, which is the fact.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finishChecks } from "../../_shared/check.js";
import { hasPrivateContent } from "../../_shared/claude-cli.js";
import { repoRoot } from "../../_shared/client.js";
import {
  createLabWorkspace, mainRequests, memoryFiles, projectRelative, requestText, runStubbed, toolUse, writeWorkspaceFile,
} from "../../_shared/config-lab.js";

const here = dirname(fileURLToPath(import.meta.url));
const IDS = { project: "STD-PROJECT-4471", naming: "STD-NAMING-2206", testing: "STD-TESTING-9310", api: "STD-API-5587" };

const has = (request, id) => requestText(request).includes(id);
const listed = (workspace, request) => memoryFiles(request).map((file) => projectRelative(workspace, file.path));

async function firstRequest(workspace, cwd) {
  const run = await runStubbed(workspace, "hello", { cwd });
  return mainRequests(run.requests)[0];
}

function contextTable(text) {
  return [...text.matchAll(/^\| (User|Project|Local|Managed) \| (.+?) \| \d+ \|$/gm)].map((match) => ({ type: match[1], path: match[2].replace(/\\/g, "/") }));
}

const workspace = createLabWorkspace("hierarchy", { sandbox: join(here, "sandbox") });

// Steps 1, 3, 4: at the root.
const root = await firstRequest(workspace, workspace.work);
console.log("Loaded at the root:", listed(workspace, root));
check("step 1: .claude/CLAUDE.md loads at the root", has(root, IDS.project));
check("step 3: a rules file without frontmatter loads at the root", has(root, IDS.testing));
check("step 4: the @ import is loaded", has(root, IDS.naming));
check("step 4: it is listed as its own file resolved from the importing file", listed(workspace, root).includes(".claude/standards/naming.md"));
check("step 2 boundary: the package's CLAUDE.md does not load at the root", !has(root, IDS.api));

// Step 2 and 5: inside the package.
const packageDir = join(workspace.work, "packages", "api");
const inPackage = await firstRequest(workspace, packageDir);
console.log("Loaded in packages/api:", listed(workspace, inPackage));
check("step 5: the package's CLAUDE.md loads when the session starts there", has(inPackage, IDS.api));
check("step 5: the project file still loads from the subdirectory", has(inPackage, IDS.project));
check("step 5: the rules file still loads from the subdirectory", has(inPackage, IDS.testing));
// You might expect the import here too, but it is silently missing, under -p.
check("step 5 trap: a project import outside the working directory is silently dropped from the subdirectory", !has(inPackage, IDS.naming) && has(inPackage, IDS.project));

// Why: the CLI treats it as an external include, which needs an approval stored per project. Setting that
// flag in the temp config proves the cause, since nothing else changes between these two runs.
const approvedSub = createLabWorkspace("hierarchy-approved", { sandbox: join(here, "sandbox") });
const approvedDir = join(approvedSub.work, "packages", "api");
const projectEntry = { hasClaudeMdExternalIncludesApproved: true, hasClaudeMdExternalIncludesWarningShown: true };
writeWorkspaceFile(approvedSub.configDir, ".claude.json", JSON.stringify({
  projects: { [approvedDir.replace(/\\/g, "/")]: projectEntry, [approvedSub.work.replace(/\\/g, "/")]: projectEntry },
}));
const approvedRun = await firstRequest(approvedSub, approvedDir);
check("with the approval flag set, the same import loads from the subdirectory", has(approvedRun, IDS.naming));

// Lazy loading: a session at the root reads a file in the package.
let readPath = join(packageDir, "handler.js");
const lazy = await runStubbed(workspace, "read it", {
  allowedTools: "Read",
  script: (_, index) => (index === 0 ? [toolUse("Read", { file_path: readPath })] : "done"),
});
const before = lazy.requests[0];
const after = lazy.requests[1];
check("the package's CLAUDE.md is absent before the read", !has(before, IDS.api));
check("it arrives attached to the Read tool result", lazy.toolCalls[0]?.resultText?.includes(IDS.api) === true || has(after, IDS.api));

// Step 5: the diagnostic. /context is available under -p and makes no API call. /memory is not.
const contextRoot = await runStubbed(workspace, "/context");
const contextPackage = await runStubbed(workspace, "/context", { cwd: packageDir });
const memory = await runStubbed(workspace, "/memory");
const tableRoot = contextTable(contextRoot.text).map((row) => projectRelative(workspace, row.path));
const tablePackage = contextTable(contextPackage.text).map((row) => projectRelative(workspace, row.path));
console.log("/context at the root:", tableRoot);
console.log("/context in packages/api:", tablePackage);
check("/context runs in print mode with no API request", contextRoot.requests.length === 0 && contextRoot.text.includes("Memory Files"));
check("/context at the root agrees with the request", JSON.stringify([...tableRoot].sort()) === JSON.stringify([...listed(workspace, root)].sort()));
check("/context in packages/api additionally lists the package's file", tablePackage.includes("packages/api/CLAUDE.md") && !tableRoot.includes("packages/api/CLAUDE.md"));
check("/context does not load anything: it made no request and the next session is unchanged", JSON.stringify(listed(workspace, await firstRequest(workspace, workspace.work))) === JSON.stringify(listed(workspace, root)));
check("/memory is not available in print mode", /Unknown skill/.test(memory.text), memory.text.trim());

// Import syntax, on a throwaway project: what counts as an import.
const syntax = createLabWorkspace("hierarchy-syntax");
writeWorkspaceFile(syntax.work, "CLAUDE.md", [
  "Root marker SYNTAX-ROOT.",
  "@sub/one.md",
  "Inline reference @sub/inline.md works mid-sentence.",
  "```",
  "@sub/fenced.md",
  "```",
  "@sub/does-not-exist.md",
  "<!-- SYNTAX-COMMENT -->",
].join("\n"));
writeWorkspaceFile(syntax.work, "sub/one.md", "SYNTAX-ONE\n@./two.md\n");
writeWorkspaceFile(syntax.work, "sub/two.md", "SYNTAX-TWO, reached through a nested import\n");
writeWorkspaceFile(syntax.work, "sub/inline.md", "SYNTAX-INLINE\n");
writeWorkspaceFile(syntax.work, "sub/fenced.md", "SYNTAX-FENCED\n");
const syntaxRun = await runStubbed(syntax, "hello");
const syntaxText = requestText(mainRequests(syntaxRun.requests)[0]);
check("a bare path after @ needs no ./ prefix", syntaxText.includes("SYNTAX-ONE"));
check("imports nest, resolving from the importing file", syntaxText.includes("SYNTAX-TWO"));
check("an @ path mid-sentence is also an import, so 'on its own line' is not required", syntaxText.includes("SYNTAX-INLINE"));
check("an @ path inside a code fence is not imported", !syntaxText.includes("SYNTAX-FENCED"));
check("a missing import is silently dropped: the run still succeeds with no error", syntaxRun.exitCode === 0 && !syntaxRun.isError && !/does-not-exist/.test(syntaxRun.stderr));
check("the unresolved @ line itself is still sent as text", syntaxText.includes("@sub/does-not-exist.md"));
check("an HTML comment in CLAUDE.md is not sent", !syntaxText.includes("SYNTAX-COMMENT"));

// Location of the import target: of two plausible places, only one resolves.
const location = createLabWorkspace("hierarchy-location");
writeWorkspaceFile(location.work, ".claude/CLAUDE.md", "@./standards/naming.md\n");
writeWorkspaceFile(location.work, "standards/naming.md", "AT-REPO-ROOT\n");
const locationRun = await runStubbed(location, "hello");
check("from .claude/CLAUDE.md, ./standards/naming.md does not reach a file at the repo root", !requestText(mainRequests(locationRun.requests)[0]).includes("AT-REPO-ROOT"));

// The blueprint is the same layout without the markers, so it gets its own run.
const blueprint = createLabWorkspace("hierarchy-blueprint", { sandbox: join(repoRoot, "blueprints", "claude-md-layout") });
const blueprintRoot = await firstRequest(blueprint, blueprint.work);
const blueprintPackage = await firstRequest(blueprint, join(blueprint.work, "packages", "api"));
check("blueprint: project file, import and rule all load at the root", ["typed error classes", "SCREAMING_SNAKE_CASE", "factory functions"].every((text) => requestText(blueprintRoot).includes(text)));
check("blueprint: the package file stays out at the root", !requestText(blueprintRoot).includes("kebab-case"));
check("blueprint: the package file loads inside the package", requestText(blueprintPackage).includes("kebab-case"));
check("blueprint: its usage comments are not sent", !requestText(blueprintRoot).includes("Commit this file"));

const anyPrivate = [root, inPackage, ...lazy.requests, blueprintRoot, blueprintPackage].some((request) => hasPrivateContent(JSON.stringify(request)));
check("no captured request holds private content", !anyPrivate);

finishChecks();
