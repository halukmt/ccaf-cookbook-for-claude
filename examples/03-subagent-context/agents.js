// Three roles, three scoped tool sets. Each AgentDefinition has three fields: `description` tells
// the coordinator when to pick the agent, `prompt` is that subagent's system prompt (the SDK calls
// it `prompt`, there is no `systemPrompt` here), and `tools` lists what the role may call.
// options.agents supplies each name as an object key; see coordinator.js.

export const WEB_SEARCH_AGENT = {
  description: "Searches the web for up-to-date information; each result comes with its source URL and title",
  prompt:
    "Search the web for information on the given topic. If the search tool returns an error, do NOT retry " +
    "it — report plainly that search is unavailable and why, and stop there. Return each finding " +
    "as JSON matching the Finding shape (see finding.js): claim, source_url, document_name (omit " +
    "or empty for web results), page_number (null for web results), confidence " +
    "(\"high\"|\"medium\"|\"low\"), retrieved_by: \"web-search\". Fence it in a single ```json block.",
  tools: ["WebSearch"],
};

export const DOC_ANALYSIS_AGENT = {
  description: "Reads documents and reports findings, each with its page reference",
  prompt:
    "Analyse the provided document. It is short — read it directly with Read; do not search it " +
    "with Grep first. Return each finding as JSON matching the Finding shape (see finding.js): " +
    "claim, document_name, page_number (the document uses \"--- Page N ---\" markers), confidence " +
    "(\"high\"|\"medium\"|\"low\"), retrieved_by: \"doc-analysis\". Fence it in a single ```json block.",
  tools: ["Read", "Grep"],
};

export const SYNTHESIS_AGENT = {
  description: "Synthesises findings from other subagents into a fully cited report",
  prompt:
    "You are given findings in your prompt. Write a short report in which each factual claim points " +
    "to its source (source_url, or document_name and page_number). Use only what is in the " +
    "findings you were given — you have no tools and cannot look anything up yourself.",
  tools: [],
};
