// The catalogue of examples, as data. The server and the dashboard both read from here.
//
// `slug` is the directory name under examples/ and also the URL and API namespace.

export const SECTIONS = [
  {
    title: "Agent architecture and orchestration",
    examples: [
      { id: "01", slug: "01-agentic-loops", title: "Agentic loops" },
      { id: "02", slug: "02-hub-and-spoke", title: "Hub-and-spoke orchestration" },
      { id: "03", slug: "03-subagent-context", title: "Subagents and explicit context" },
      { id: "04", slug: "04-deterministic-gates", title: "Deterministic gates and handoffs" },
      { id: "05", slug: "05-agent-sdk-hooks", title: "Agent SDK hooks" },
      { id: "06", slug: "06-task-decomposition", title: "Task decomposition" },
      { id: "07", slug: "07-session-resumption", title: "Sessions and resumption" },
    ],
  },
  {
    title: "Tool design and MCP",
    examples: [
      { id: "08", slug: "08-tool-descriptions", title: "Tool descriptions as routing" },
      { id: "09", slug: "09-structured-tool-errors", title: "Structured tool errors" },
      { id: "10", slug: "10-tool-distribution", title: "Tool sets and tool choice" },
      { id: "11", slug: "11-mcp-configuration", title: "MCP server configuration" },
      { id: "12", slug: "12-built-in-tools", title: "Built-in tools" },
    ],
  },
  {
    title: "Claude Code configuration",
    examples: [
      { id: "13", slug: "13-claude-md-layout", title: "CLAUDE.md layout" },
      { id: "14", slug: "14-commands-and-skills", title: "Commands and skills" },
      { id: "15", slug: "15-path-scoped-rules", title: "Path-scoped rules" },
      { id: "16", slug: "16-plan-or-direct", title: "Plan mode or direct execution" },
      { id: "17", slug: "17-iterative-refinement", title: "Iterative refinement" },
      { id: "18", slug: "18-ci-review", title: "Claude Code in CI" },
    ],
  },
  {
    title: "Prompts and structured output",
    examples: [
      { id: "19", slug: "19-explicit-criteria", title: "Explicit review criteria" },
      { id: "20", slug: "20-few-shot-examples", title: "Few-shot examples" },
      { id: "21", slug: "21-structured-output", title: "Structured output" },
      { id: "22", slug: "22-validation-retry", title: "Validation and retry" },
      { id: "23", slug: "23-batch-processing", title: "Batch processing" },
      { id: "24", slug: "24-multi-pass-review", title: "Multi-pass review" },
    ],
  },
  {
    title: "Context and reliability",
    examples: [
      { id: "25", slug: "25-context-window", title: "Context window management" },
      { id: "26", slug: "26-escalation-triggers", title: "Escalation triggers" },
      { id: "27", slug: "27-error-propagation", title: "Error propagation" },
      { id: "28", slug: "28-codebase-exploration", title: "Codebase exploration" },
      { id: "29", slug: "29-human-review-calibration", title: "Human review and calibration" },
      { id: "30", slug: "30-source-provenance", title: "Source provenance" },
    ],
  },
];

// slug -> example, for route lookups.
export const EXAMPLES_BY_SLUG = new Map(
  SECTIONS.flatMap((section) => section.examples.map((example) => [example.slug, example]))
);
