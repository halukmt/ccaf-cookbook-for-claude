# 08 Tool descriptions as routing: notes

All live runs: 2026-10-31, `claude-sonnet-5-5`, `@modelcontextprotocol/sdk` 1.30.0. Each query is one API call.
The conflicting system prompt was reworded after these runs, with the same meaning, and not re-run. [results/system-prompts.json](results/system-prompts.json) holds the wording that was measured.

## Step 1: A real MCP server publishes what the model sees

Built: A real `McpServer` with `get_customer` and `lookup_order`, connected through the SDK's in-memory transport.
Files: [customer-tools-server.js](customer-tools-server.js), [step-1-tools.js](step-1-tools.js)
Executed: yes, 7 of 7 checks, no API cost. The tool definitions the model gets come from a real `listTools` call.
Uses `registerTool` with a zod schema: `server.tool` is deprecated in SDK 1.30.0, and it
takes zod, not `{ identifier: { type: "string" } }`. In-memory transport, because this measures routing, not transport;
example 09 uses stdio.

## Step 2: Vague descriptions cost tool calls, not correct routing

Built: A harness that records the first tool chosen, keeping "wrong tool" and "no call" apart.
Files: [routing.js](routing.js), [step-2-baseline.js](step-2-baseline.js), [results/baseline.json](results/baseline.json)
Executed: yes, 4 of 4 checks. **6 correct, 0 wrong tool, 4 no call.**
Expected going in: 2 to 3 misrouted queries. Measured here: none. Every query with an identifier went to
the right tool on names alone. The four with no identifier ("Where is my package?") got a question back, which is sensible
behaviour that a plain accuracy score counts as a miss.
Four harder queries were added, where a person is named and a purchase is asked about, to find
real wrong-tool results. They gave 1 correct, 3 wrong tool. Results are saved so that step 4 compares with this run.

## Step 3: A better description can change the tool's contract

Built: Purpose, formats, examples, edge case and a boundary naming the other tool, in five sentences each.
Files: [customer-tools-server.js](customer-tools-server.js)
Executed: yes, through step 4. The checks in step 1 verify the elements are present.
Identifier formats match this repo's mock data style. Each description adds an edge-case rule:
with no identifier, pass `current` or `latest`. That is more than wording: it changes the tool's contract, and a real handler
must support those values. Here the handler is a stub.

## Step 4: The gain came from "no call" rows, not from fixing misrouting

Files: [step-4-compare.js](step-4-compare.js), [results/rich.json](results/rich.json)
Executed: yes, 5 of 5 checks. **10 queries: 6/10 to 10/10; wrong tool 0 to 0, no call 4 to 0. Harder 4: 1/4 to 1/4.**
The whole gain came from "no call" becoming a call, thanks to the sentinel rule, and not from fixing
misrouting. On the harder queries the rewrite changed nothing, even with "use lookup_order ... even when an email appears too".
A likely reason, not tested: `lookup_order` accepts only an order number, so with only an email available, `get_customer` is the
reasonable first move. My `expected` labels for those queries are arguable. A description cannot route to a tool that
cannot accept the input the user has. The fix there would be a tool contract change.
Trap: A single accuracy number hides this. 6/10 reads as "4 misrouted"; in fact 0 were.

## Step 5: A conflicting system prompt adds a needless first call

Built: The conflicting prompt, a rewritten one, and a small scanner for phrases that tie an action to a tool's subject.
Files: [system-prompts.js](system-prompts.js), [step-5-system-prompt.js](step-5-system-prompt.js), [results/system-prompts.json](results/system-prompts.json)
Executed: yes, 6 of 6 checks. **No prompt 10/10, conflicting 4/10, rewritten 10/10.**
Phrases found: `Always check customer`, `check customer details before`. Rewrite: "Choose tools by what the request asks
about, as each tool's description explains."
Saying the prompt makes the model select one tool instead of the other is too strong. In all 6 "wrong" rows the model called `get_customer` and
`lookup_order` in parallel in the same turn, with `get_customer` first. It obeyed the prompt and still called the right tool. The
cost is an unneeded lookup on every request, and any logic that reads only the first tool_use block gets the wrong one.
Limit: the scanner is a regex for review prompts, and it can miss phrasing or flag harmless text. The measured run is the real test.
Trap: Read all tool_use blocks in a turn, not just the first.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js): descriptions, system prompt and query set as knobs. Route and one two-query live run checked.

## Takeaways

1. Look at descriptions first when routing is wrong: it is the cheapest change, and needs no architecture work.
2. Score "wrong tool" and "no call" separately. They have different fixes.
3. A description cannot compensate for a missing input path. If users have an email and the tool needs an order number,
   change the tool.
4. A short, confident system prompt line beat five sentences of description on every one of 6 order queries. Review prompts
   when adding tools.
5. These are single runs per query. They show direction, not a rate. For a rate, repeat queries and use a bigger set.
6. Sonnet 5.5 is more robust against vague descriptions than expected when the name and the ID format agree. The
   expected 2 to 3 misroutes did not reproduce.
