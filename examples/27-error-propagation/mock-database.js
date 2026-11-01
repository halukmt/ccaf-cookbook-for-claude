// A simulated research database. Every failure here is simulated: real outages are not available on demand, and a
// plan per topic makes each path repeatable. The first two topics quote the shared research fixture.

import { findDocumentById } from "../../_fixtures/research.js";

export class SearchError extends Error {
  constructor(failureType, message, { partialResults = [], kind = "error" } = {}) {
    super(message);
    this.failureType = failureType;
    this.partialResults = partialResults;
    this.kind = kind;
  }
}

const doc = (id) => {
  const found = findDocumentById(id);
  return { title: found.title, source: found.url, excerpt: found.text, retrieved: true };
};
const made = (n, topic, excerpt) => ({ title: `${topic} report ${n}`, source: `https://kb.example.com/${topic.replace(/\s+/g, "-")}/${n}`, excerpt, retrieved: true });

const gateways = [1, 2, 3, 4, 5].map((n) => made(n, "gateway patches", `Gateway team ${n} patched its batch handling during the spring rollout.`));
const pricing = [made(1, "vendor pricing", "Vendor support contracts rose by about 4 percent after the release.")];

export const TOPICS = [
  { topic: "session tokens", plan: "ok", results: [doc("DOC-1")] },
  { topic: "rollout speed", plan: "transient-twice", results: [doc("DOC-2")] },
  { topic: "gateway patches", plan: "partial", results: gateways, expected: 5 },
  { topic: "customer outages", plan: "empty" },
  { topic: "vendor pricing", plan: "down-with-archive", results: pricing },
  { topic: "regional rollout", plan: "down" },
  { topic: "migration dates", plan: "bad-date", results: [made(1, "migration dates", "Most teams migrated in the eight weeks before 2031-06-01.")] },
  { topic: "security audit", plan: "forbidden" },
  { topic: "legal exemption", plan: "contract-review" },
];

// Each database instance counts its own attempts, so a test can see how often the query really ran.
export function createDatabase(topics = TOPICS) {
  const calls = new Map();
  const byName = new Map(topics.map((t) => [t.topic, t]));

  async function searchDatabase(query, { dateRange, source = "primary" } = {}) {
    const entry = byName.get(query);
    if (!entry) return [];
    const attempt = (calls.get(`${query}:${source}`) ?? 0) + 1;
    calls.set(`${query}:${source}`, attempt);

    switch (entry.plan) {
      case "ok":
        return entry.results;
      case "empty":
        return [];
      case "transient-twice":
        if (attempt <= 2) throw new SearchError("transient", "Connection timeout after 30s", { kind: "timeout" });
        return entry.results;
      case "partial":
        // Attempt 1 gets two sources, attempt 2 one more, then the connection stays down.
        if (attempt === 1) throw new SearchError("transient", "Connection reset mid-stream", { partialResults: entry.results.slice(0, 2) });
        if (attempt === 2) throw new SearchError("transient", "Connection reset mid-stream", { partialResults: entry.results.slice(1, 3) });
        throw new SearchError("transient", "Connection refused");
      case "down-with-archive":
        if (source === "archive") return entry.results;
        throw new SearchError("transient", "Connection timeout after 30s", { kind: "timeout" });
      case "down":
        throw new SearchError("transient", "Connection timeout after 30s", { kind: "timeout" });
      case "bad-date":
        if (!/^\d{4}-\d{2}-\d{2}/.test(dateRange ?? "")) throw new SearchError("validation", `dateRange "${dateRange}" is not an ISO date range`);
        return entry.results;
      case "forbidden":
        throw new SearchError("permission", "403: this index needs the compliance role");
      case "contract-review":
        throw new SearchError("business", "Data sharing for this topic is on hold pending contract review");
      default:
        throw new Error(`Unknown plan ${entry.plan}`);
    }
  }
  return { searchDatabase, callsFor: (query, source = "primary") => calls.get(`${query}:${source}`) ?? 0 };
}
