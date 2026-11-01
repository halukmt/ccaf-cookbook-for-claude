# CCA-F Cookbook for Claude

Thirty runnable examples of agent patterns for Claude, each run against the real API or the real
Claude Code CLI, with the results written down. They cover the topics of the Claude Certified
Architect Foundations (CCA-F) certification.

**Unofficial.** Not affiliated with, authorised or endorsed by Anthropic. It contains no exam
questions.

The most useful part is often where real behaviour differed from common advice. For example, forced
`tool_choice` is rejected by current top models, a crashing `PreToolUse` hook lets the tool call
through, and two `paths:` globs written as a list never loaded. Each `notes.md` records what was
measured and what was not executed.

## What is here

| Folder | Use it for |
|---|---|
| [patterns/](patterns/) | One short decision guide per concept: when to use it, when not to, the trap, and when it was verified |
| [blueprints/](blueprints/) | Copy-ready files: CI review, `CLAUDE.md` layout, commands and skills, path rules |
| [examples/](examples/) | Runnable code for every pattern, 01 to 30, with `notes.md` per example |
| `_shared/`, `_fixtures/` | Code and test data the examples share |

## How it works

There are two ways to use this repository:

- **As a plugin in your own projects.** You install it in Claude Code and ask for a review. A skill
  reads your project, changes nothing, and recommends patterns with file and line evidence.
- **As a reference and lab.** Read `patterns/`, copy from `blueprints/`, or clone the repository and
  run the examples as described under [Run it](#run-it).

## Use it in another project

Install the plugin from within Claude Code:

```
/plugin marketplace add halukmt/ccaf-cookbook-for-claude
/plugin install ccaf-cookbook-for-claude@ccaf-cookbook
```

Then ask Claude to review your agent architecture, or run
`/ccaf-cookbook-for-claude:agent-architecture-review`.

For other AI assistants, clone the repository and point them at [AGENTS.md](AGENTS.md).

### Try it in a test project

An empty folder is enough to check the installation, but the review needs some agent code to be
meaningful.

1. Create a new folder and open Claude Code in it.
2. Install the plugin with the two commands above. Restart Claude Code if the skill does not appear.
3. Ask Claude to create something to review, for example: "Build a small support agent with the
   Claude API that issues refunds without any checks."
4. Run `/ccaf-cookbook-for-claude:agent-architecture-review`, or write "Review the agent architecture
   of this project."

You should get recommendations such as deterministic gates and escalation, each with a file and
line. In our tests, one review cost 0.09 to 0.23 USD with an API key. With a Claude subscription, it
counts towards your usage instead.

The plugin is active in all your projects by default. To remove it:

```
/plugin uninstall ccaf-cookbook-for-claude@ccaf-cookbook
```

### What it suits

It helps with projects that use Claude agents or Claude Code. It is of little use elsewhere.

| Project | Value |
|---|---|
| Agents, tool use, MCP, structured output | High |
| Claude Code setup: `CLAUDE.md`, hooks, CI | High |
| Ordinary app or website without AI | Little; the review reports that nothing applies |

The patterns are concepts that apply in any programming language, and the skill can read code in
any language. All examples are JavaScript for Node.js, so other languages need a translation. The
review has only been tried on two small test projects, and not on Python or Java code.

### What is included

One skill: `agent-architecture-review`. The patterns are not separate skills. They are files the
review reads when they apply.

## Run it

You need Node.js and an Anthropic API key. Examples 13 to 18 and a few others also need the
Claude Code CLI.

```powershell
npm install
copy .env.example .env    # then add your key as ANTHROPIC_API
npm start                 # or double-click start.cmd on Windows
```

This opens http://localhost:4111, with all 30 examples. Most have a browser page where you can run
them. Examples 13 to 18 configure Claude Code and run in the terminal, so their pages show the notes
and results. The API key stays on your machine: the page talks to the local server, and the server
talks to the API.

To run a script directly:

```powershell
node examples/04-deterministic-gates/step-5-handoff.js
```

**Running examples costs money.** Most runs cost cents, but the Agent SDK coordinator in example 03
cost between 1 and 2 USD per run. Scripts check their own results and exit with an error if a check fails.

## Examples

### Agent architecture and orchestration

- [01 Agentic loops](examples/01-agentic-loops/)
- [02 Hub-and-spoke orchestration](examples/02-hub-and-spoke/)
- [03 Subagents and explicit context](examples/03-subagent-context/)
- [04 Deterministic gates and handoffs](examples/04-deterministic-gates/)
- [05 Agent SDK hooks](examples/05-agent-sdk-hooks/)
- [06 Task decomposition](examples/06-task-decomposition/)
- [07 Sessions and resumption](examples/07-session-resumption/)

### Tool design and MCP

- [08 Tool descriptions as routing](examples/08-tool-descriptions/)
- [09 Structured tool errors](examples/09-structured-tool-errors/)
- [10 Tool sets and tool choice](examples/10-tool-distribution/)
- [11 MCP server configuration](examples/11-mcp-configuration/)
- [12 Built-in tools](examples/12-built-in-tools/)

### Claude Code configuration

- [13 CLAUDE.md layout](examples/13-claude-md-layout/)
- [14 Commands and skills](examples/14-commands-and-skills/)
- [15 Path-scoped rules](examples/15-path-scoped-rules/)
- [16 Plan mode or direct execution](examples/16-plan-or-direct/)
- [17 Iterative refinement](examples/17-iterative-refinement/)
- [18 Claude Code in CI](examples/18-ci-review/)

### Prompts and structured output

- [19 Explicit review criteria](examples/19-explicit-criteria/)
- [20 Few-shot examples](examples/20-few-shot-examples/)
- [21 Structured output](examples/21-structured-output/)
- [22 Validation and retry](examples/22-validation-retry/)
- [23 Batch processing](examples/23-batch-processing/)
- [24 Multi-pass review](examples/24-multi-pass-review/)

### Context and reliability

- [25 Context window management](examples/25-context-window/)
- [26 Escalation triggers](examples/26-escalation-triggers/)
- [27 Error propagation](examples/27-error-propagation/)
- [28 Codebase exploration](examples/28-codebase-exploration/)
- [29 Human review and calibration](examples/29-human-review-calibration/)
- [30 Source provenance](examples/30-source-provenance/)

## How far to trust the results

Results were measured on the model and tool versions named in each file. Many comparisons rest on a
single run or a small sample, and a few use simulated data. Each `notes.md` says so where it applies.
Re-run an example before relying on a result for a newer version.

## Licence

MIT.
