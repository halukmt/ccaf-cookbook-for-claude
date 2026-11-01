// Mock web and document data for research examples. All of it is invented: the "MCP changes" below are
// not real facts about any specification. No network is involved.

export const SEARCH_RESULTS = [
  {
    title: "Specification changes, spring release",
    url: "https://docs.internal.com/mcp/spec-changes.md",
    snippet: "The spring release adds session tokens and retires batch requests.",
  },
  {
    title: "Rollout notes for the spring release",
    url: "https://wiki.company.com/mcp/rollout-notes.md",
    snippet: "Teams migrated within six weeks. Two gateways needed patches.",
  },
  {
    title: "Hot takes on the new release",
    url: "https://blog.example.net/mcp-hot-takes",
    snippet: "An opinion post, with no source for its claims.",
  },
];

export const PAGES = {
  "https://docs.internal.com/mcp/spec-changes.md": "Links: https://wiki.company.com/mcp/rollout-notes.md",
  "https://wiki.company.com/mcp/rollout-notes.md": "Links: https://docs.internal.com/mcp/spec-changes.md",
  "https://blog.example.net/mcp-hot-takes": "Everyone hates the new release. Links: https://blog.example.net/more",
};

export const DOCUMENTS = [
  {
    id: "DOC-1",
    url: "https://docs.internal.com/mcp/spec-changes.md",
    title: "Specification changes, spring release",
    author: "Protocol working group",
    date: "2031-03-14",
    type: "specification",
    text:
      "The spring release adds session tokens for stateful servers. Batch requests are retired. " +
      "Servers must declare their supported versions. The change takes effect on 2031-06-01.",
  },
  {
    id: "DOC-2",
    url: "https://wiki.company.com/mcp/rollout-notes.md",
    title: "Rollout notes for the spring release",
    author: "Platform team",
    date: "2031-05-02",
    type: "internal notes",
    text:
      "Teams migrated within six weeks. Two gateways needed patches because they relied on batch requests. " +
      "No customer outage was recorded. The session token rollout finished before 2031-06-01.",
  },
];

export const findDocumentByUrl = (url) => DOCUMENTS.find((doc) => doc.url === url) ?? null;
export const findDocumentById = (id) => DOCUMENTS.find((doc) => doc.id === id) ?? null;
