# Pattern index

Find the signals you can see in the project. Each pattern is at `../../patterns/<name>.md`.

## Agent structure

| Signal in the project | Pattern |
|---|---|
| A hand-written loop around the Messages API, or a next step that depends on a tool result | `agentic-loop` |
| A broad request split between several workers, with a coordinator | `hub-and-spoke-orchestration` |
| Subagents through the Agent SDK or Claude Code; later agents must cite earlier ones | `explicit-subagent-context` |
| Agent work that spans a break, or knowledge passed between runs | `session-resume-or-fresh` |
| Long exploration of a codebase that could be cut off or compacted | `scratchpad-and-manifest` |

## Safety and control

| Signal in the project | Pattern |
|---|---|
| A tool moves money, changes access, deletes data or sends something outward | `deterministic-gates` |
| A required order of steps that only the prompt enforces | `deterministic-gates` |
| Rules across many tools, or tools you do not own, under the Agent SDK or Claude Code | `tool-hooks` |
| A customer-facing agent that can act on accounts | `escalation-and-ambiguity` |
| Escalations to people who cannot see the conversation | `self-contained-handoff` |
| Automated output partly reviewed by people, with limited review capacity | `confidence-calibrated-review` |

## Tools and MCP

| Signal in the project | Pattern |
|---|---|
| Two or more tools with overlapping subject or inputs; tools picked wrongly | `tool-descriptions` |
| Tools that can fail in different ways, or a failed lookup that looks like no match | `structured-tool-errors` |
| Agents with different jobs sharing tools, or a broad tool such as "fetch any URL" | `tool-scoping` |
| A `.mcp.json`, or an MCP server that needs a credential | `mcp-configuration` |
| An agent that edits across files of an existing project | `code-navigation-and-edit` |

## Prompts and output

| Signal in the project | Pattern |
|---|---|
| A model judges code or documents; noisy or inconsistent findings | `explicit-review-criteria` |
| The same judgement call goes differently between inputs, and instructions are already complete | `few-shot-examples` |
| Code parses the model's answer | `structured-extraction` |
| Values obey rules a schema cannot express, such as sums or date order | `validation-retry-loop` |
| High-volume work where nothing waits for the result | `batch-processing` |
| Review of many files, or defects that sit between modules | `multi-pass-review` |

## Context and reliability

| Signal in the project | Pattern |
|---|---|
| Amounts, dates or references that must survive a long conversation | `case-facts-block` |
| Several subagents or sources feed one result, and one may fail | `error-propagation-and-coverage` |
| Several sources feed a written output that readers must be able to check | `claim-source-provenance` |

## Claude Code setup

| Signal in the project | Pattern |
|---|---|
| A `CLAUDE.md`, a monorepo, or rules that work for only some people | `claude-md-layering` |
| A repeated team workflow, or exploration that floods the conversation | `commands-and-skills` |
| A convention tied to one file type spread across many folders | `path-scoped-rules` |
| Large or risky tasks with several valid shapes | `plan-or-direct` |
| Results that differ between runs, or several changes that must agree | `iterative-refinement` |
| Claude in a CI pipeline or PR review | `ci-review-pipeline` |
