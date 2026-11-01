// Offline stand-in for the real WebSearch tool, not used by the current code. It dates from a
// former API provider that blocked WebSearch; on the direct API the real tool is used.
// Same idea as example 01's mock web_search: a small fixed corpus, so the
// web_search_agent subagent has a real tool to call and a real source URL to
// cite, without depending on live search or its non-determinism.

import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

const CORPUS = [
  {
    keywords: ["solar", "panel", "recycl"],
    title: "EU sets 2026 solar panel recycling targets",
    url: "https://example-energy-news.test/solar-recycling-2026",
    snippet:
      "Manufacturers must recover at least 80% of panel material by weight starting in 2026, up from 65% today.",
  },
  {
    keywords: ["battery", "second", "life", "ev"],
    title: "Second-life EV batteries move into grid storage",
    url: "https://example-energy-news.test/second-life-batteries",
    snippet:
      "Retired EV battery packs retain 70-80% capacity and are increasingly repurposed for stationary grid storage.",
  },
  {
    keywords: ["curtailment", "grid", "storage"],
    title: "Grid curtailment rose as storage build-out lagged",
    url: "https://example-energy-news.test/curtailment-report",
    snippet:
      "Renewable curtailment increased 15% year-over-year in regions where battery storage deployment fell behind generation.",
  },
];

function search(query) {
  const q = query.toLowerCase();
  const hit = CORPUS.find((entry) => entry.keywords.some((k) => q.includes(k)));
  return hit ? [hit] : [];
}

export const mockSearchServer = createSdkMcpServer({
  name: "mock_search",
  version: "1.0.0",
  tools: [
    tool(
      "search",
      "Search a small fixed corpus of energy-technology news for a query. Returns title, url, snippet.",
      { query: z.string().describe("what to search for") },
      async ({ query }) => {
        const results = search(query);
        const text =
          results.length === 0
            ? "No results in the mock corpus for this query."
            : results.map((r) => `${r.title}\n${r.url}\n${r.snippet}`).join("\n\n");
        return { content: [{ type: "text", text }] };
      }
    ),
  ],
});
