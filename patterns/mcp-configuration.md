# MCP configuration in Claude Code

Decide where each MCP server is configured, how it gets credentials, and how the model finds out when to use it.

## Use when

- A project or a person adds an MCP server to Claude Code
- A server needs a credential that must not enter version control
- A server's tools or data are being ignored in favour of built-in tools

## Do not use when

- An SDK or your own loop connects to the server directly; none of these config files apply
- A built-in tool already does the job well

## Decision

Put shared servers in `.mcp.json` at the project root, personal ones at user scope, and one-project private overrides at local scope. If a name exists in several, local beats project, and project beats user.
Reference every secret as `${VAR}`, and have the server refuse to start on a missing value. Give tools a true description that says what they return and when a built-in is the better choice. If you publish
a resource, point to it from a tool description, or the model may never read it.

## Trap

The list command says "Connected" even when a referenced variable is unset. There is no warning, and the server receives the literal `${VAR}` text as its credential, so the failure appears later as an authentication error from
elsewhere. Also, a stdio server inherits the CLI's environment, which here included the Anthropic API key, so a third-party server is trusted code. A repository's `.mcp.json` also started servers under `-p` with no
approval step, so non-interactive runs on an untrusted checkout execute whatever it names. `claude mcp add` without a flag writes to local scope, so a teammate never receives that server.

## Example

[mcp-lab.js](../examples/11-mcp-configuration/mcp-lab.js): testing all of this in a throwaway config directory.
[scope-server.js](../examples/11-mcp-configuration/scope-server.js): a server that reports what it received.
[catalog-server.js](../examples/11-mcp-configuration/catalog-server.js): a resource, and the pointer that gets it read.
[search-server.js](../examples/11-mcp-configuration/search-server.js): sparse and enhanced descriptions over the same code.

## Verified

2026-10-31, Claude Code CLI 2.1.77, MCP SDK 1.30.0, `claude-haiku-5-5`, with a dummy credential in a temp config directory. Scope order was read from the server that actually started. A schema question took 6 to 9 tool calls with or without a published
resource, and 1 to 2 with a pointer in a tool description. A working search tool with a 13-character description lost to Grep twice; with an accurate 573-character description it was picked first three times. Community server with a real token: not executed. Interactive approval and
interactive `@` mentions: not executed.

## Usual advice vs observed

The usual advice says a resource gives the agent visibility without exploratory calls. Here, the content was not in the first request, and the model kept exploring with the tools until something pointed it to the resource. An `@` mention
in a `-p` prompt arrives as plain text. The usual GitHub community server package is now marked deprecated on npm.
