# 11 MCP server configuration: notes

All live runs: 2026-10-31, Claude Code CLI 2.1.77, `@modelcontextprotocol/sdk` 1.30.0, `claude-haiku-5-5`. Every run used a temp project, a temp `CLAUDE_CONFIG_DIR`
and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. Each paid script checks the captured API requests for the private global instructions: none were sent.
CLI-reported cost across all live runs of this example, including superseded ones: about $1.60.
The resource's description was reworded after these runs, with the same meaning, and not re-run.

## Step 1: `.mcp.json` connects a local server at project scope

Built: A project `.mcp.json` with a local server I wrote, plus a community GitHub config file as an example.
Files: [scope-server.js](scope-server.js), [mcp-lab.js](mcp-lab.js), [community-github.mcp.json](community-github.mcp.json), [step-1-2-project-config.js](step-1-2-project-config.js)
Executed: yes, 13 of 13 checks, no API cost. `claude mcp list` connected the server, and `claude mcp get` reported project scope.
**Not executed: the community GitHub server.** No token exists here and none may be requested. [community-github.mcp.json](community-github.mcp.json) is only parsed; it was never run.
Finding: `npm view` reports `@modelcontextprotocol/server-github`, the package that file points at, as deprecated (version 2025.4.8, "Package no longer supported"). **Do not copy the file as it stands: choose a maintained server in a real project.**
Not verified: whether that package reads `GITHUB_TOKEN` at all. I recall it uses another variable name, but downloading the package to check was denied by the
permission system, and I did not pursue it.
A local server stands in for the community server, which also lets the server report what it received.

## Step 2: `${VAR}` expansion gives no warning when the variable is unset

Executed: yes. The server reported a SHA-256 of what it received, and it matched the dummy value. File and `git diff --cached` hold only the reference.
Findings:
- **Variable unset: no warning.** `claude mcp list` exits 0 and shows "Connected", and the server receives the literal text `${CCAF_DEMO_TOKEN}` as its token. Seen through
  `mcp list` only. A server should validate its own token at startup.
- `${VAR:-default}` works too.
- The expanded value never reached the model's requests, in the live run. Only the hash, which the server chose to return, did.

Trap: "Connected" means the process started and answered. It says nothing about the credential.

## Step 3: Local beats project, and project beats user

Files: [step-3-scopes.js](step-3-scopes.js), [step-3-live.js](step-3-live.js)
Executed: scopes script 16 of 16 checks, no API cost; live script 9 of 9, $0.1275. User-level steps ran only against the temp config dir. The real `~/.claude.json` was searched for the
probe markers, and holds neither.
What the CLI really does, read from the server that actually started:
- Same name in several scopes: **local beats project, and project beats user**. Removing local falls back to project.
- `claude mcp add` with no `--scope` writes to **local**, not user or project.
- Local entries live in the same `.claude.json`, under `projects.<path>.mcpServers`. So that file is not only "user level": only its top-level `mcpServers` is user scope.
- With `CLAUDE_CONFIG_DIR` set, the file is `<dir>/.claude.json`.
- Expansion also works at user level.
- In the live run the model called tools from both scopes in one session. The project server loaded under `-p` with no approval step (`hasTrustDialogAccepted` stayed false).
  **Not executed:** the interactive approval prompt for `.mcp.json`, since a terminal session cannot be driven here.
- **The stdio server could see `ANTHROPIC_API_KEY`** (recorded as a yes or no only). In this setup the server inherits the CLI's environment. Any third-party server would receive that too.

Uses `claude mcp add-json` instead of hand-editing the file, so the CLI itself performs the write.

## Step 4: A published resource goes unread until a tool description points at it

Files: [catalog-server.js](catalog-server.js), [step-4-resource.js](step-4-resource.js), [../../_fixtures/shop-schema.js](../../_fixtures/shop-schema.js)
Executed: yes, final form 21 of 21 checks, $0.2339. An MCP client listed and read the resource with its name, description and mimeType.
Commonly assumed: a resource makes the data "available immediately", with no exploratory calls. **Measured here: publishing a resource changed nothing by itself.** In this CLI:

| Setup | Tool calls, across script runs | Catalogue in first request |
|---|---|---|
| No resource | 9, 7, 9, 9 | no |
| Resource published | 9, 6, 9, 9 | no |
| Resource, plus a hint in `list_tables`'s description | 1, 2, 1 | no |
| `@db:db://schema/main` in a `-p` prompt | 2, 9, 9 | no, arrives as plain text |

The content is not sent up front. The model gets `ListMcpResourcesTool` and `ReadMcpResourceTool` and mostly ignored them, until a tool description pointed at the resource. So the saving is real, 9 calls to 1,
but it comes from the pointer. Interactive `@` mentions were **not executed**; they may be expanded there.
Uses `registerResource`, as `resource` is deprecated. A hint variant and a mention variant were added once the plain comparison showed no effect. Earlier versions of the script
failed on "the model read the resource" and on "the mention expands", and I changed those checks to what really happens.

## Step 5: A better description made the MCP search the first choice

Files: [search-server.js](search-server.js), [step-5-descriptions.js](step-5-descriptions.js)
Executed: yes, final form 13 of 13 checks, $0.1068. Same working server, description only changed; the captured request confirms the description sent.
- Sparse (13 characters; Grep's is 866): `Grep -> Grep`, in both runs.
- Enhanced (573 characters): `search_codebase` first in all three runs; twice alone, once followed by a Grep. Cost slightly lower.

All runs gave the right answer.
The description makes no claim such as "AST-aware indexing" or "more accurate than Grep", which a stub could not back. This server is a real function-level word search, and its description says what it is, including what it
cannot do. A description that overstates will win selection for the wrong reason.
Limit: two to three runs on one question. Direction, not a rate.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js): free scope and expansion view, plus resource and description variants. Route, free mode and one live run checked.

## Takeaways

1. Team servers go in `.mcp.json`, personal ones at user scope, and a private override for one project at local scope, which is the default of `claude mcp add`.
2. Keep secrets out of the file with `${VAR}`, and have the server reject a token that is missing or still looks like `${...}`. The CLI will not warn you.
3. Treat every stdio server as code running with your environment. Check what it inherits, and pin what you install.
4. A resource alone is not a saving. Point to it from a tool description, or do not count on it being read.
5. Give an MCP tool a description at least as useful as the built-in it competes with, and keep it true.
6. Under `-p`, a repository's `.mcp.json` starts servers with no prompt in this version. Do not run `-p` on an untrusted checkout.
