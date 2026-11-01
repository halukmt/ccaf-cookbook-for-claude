# Tool descriptions as routing

Treat each tool's description as the routing logic for that tool, and test it as such.

## Use when

- An agent has two or more tools whose subject matter or inputs overlap
- A tool is being picked wrongly, or the model asks for details instead of calling it
- A server's tools are consumed by agents whose prompts you do not control

## Do not use when

- There is one tool, or the tools are so different that names alone settle it; five sentences add only tokens
- The right tool cannot accept what the user has; fix the tool's inputs instead

## Decision

State what the tool does, the input formats with an example, what it returns, sample requests, what happens at the edges, and which
sibling tool to use instead. Then measure on a fixed query list, before and after, keeping "wrong tool" and "no call" as separate
scores. Read the system prompt in the same review: any "always check X first" line can bind to one tool.

## Trap

An instruction in the system prompt can outrank careful descriptions, and it looks harmless. A one-line "always check customer details"
pulled an unneeded customer lookup into every order question. Code that reads only the first `tool_use` block then acts on the
wrong tool. A single accuracy score also misleads: a run where the model asks for a missing ID scores the same as a real misroute.

## Example

[customer-tools-server.js](../examples/08-tool-descriptions/customer-tools-server.js): the same tools with both description sets.
[routing.js](../examples/08-tool-descriptions/routing.js): the measuring harness.
[system-prompts.js](../examples/08-tool-descriptions/system-prompts.js): the prompt pair and review scanner.

## Verified

2026-10-31, `claude-sonnet-5-5`, MCP SDK 1.30.0, one run per query. Vague descriptions: 6 of 10 correct, 0 wrong tool, 4 no call.
Rich descriptions: 10 of 10. Adding "always check customer details": 4 of 10, with all 6 misses calling both tools in the same turn.
Neutral prompt: 10 of 10. Four queries naming a person but asking about a purchase: 1 of 4 before and after the rewrite.

## Usual advice vs observed

The usual advice predicts plain misrouting from vague descriptions and a clear fix from better ones. On this model no plain query
was misrouted. The gain came from a rule telling the model what to pass when no ID is given, which is a contract change that the
handler must honour. Where the user's identifier did not fit the intended tool, better wording changed nothing.
