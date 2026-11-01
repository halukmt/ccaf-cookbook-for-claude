// Free: what the constrained tool refuses, and what the generic tool it replaces would accept.

import { check, finishChecks } from "../../_shared/check.js";
import { documentUrlProblem, fetchUrl, loadDocument } from "./load-document.js";
import { agentToolsets } from "./toolsets.js";

const ACCEPTED = [
  "https://docs.internal.com/mcp/spec-changes.md",
  "https://wiki.company.com/mcp/rollout-notes.md",
  "https://docs.internal.com/PLAN.PDF",
];
const REJECTED = [
  ["https://blog.example.net/mcp-hot-takes", "untrusted domain, no extension"],
  ["https://evil.example.com/report.pdf", "document extension, untrusted domain"],
  ["https://docs.internal.com/admin/delete-all", "trusted domain, not a document"],
  ["http://docs.internal.com/mcp/spec-changes.md", "not https"],
  ["https://docs.internal.com.evil.example/a.pdf", "lookalike domain"],
  ["https://docs.internal.com@evil.example/a.pdf", "domain in the userinfo"],
  ["https://user:pass@docs.internal.com/a.pdf", "credentials in the URL"],
  ["https://evil.example/a.pdf?x=docs.internal.com", "domain in the query"],
  ["https://docs.internal.com/a.exe?file=a.pdf", "extension in the query"],
  ["http://169.254.169.254/latest/meta-data", "cloud metadata service"],
  ["file:///C:/secrets.txt", "local file"],
  ["not a url", "not a URL at all"],
];

for (const url of ACCEPTED) check(`Accepts ${url}`, documentUrlProblem(url) === null);
for (const [url, why] of REJECTED) {
  const problem = documentUrlProblem(url);
  check(`Rejects ${url}`, problem !== null, `${why}: ${problem}`);
}

const loaded = JSON.parse(loadDocument({ url: ACCEPTED[0] }));
check("A valid URL returns the document text", loaded.sourceId === "DOC-1" && loaded.text.includes("session tokens"));
const rejected = loadDocument({ url: "https://evil.example.com/report.pdf" });
check("A rejected URL is an error result with a reason", rejected.isError === true && /not a trusted domain/.test(rejected.content), rejected.content);

const generic = fetchUrl({ url: "http://169.254.169.254/latest/meta-data" });
check("The generic fetch_url would have accepted the metadata service", generic.includes("169.254.169.254"), generic);

const offered = Object.values(agentToolsets).flatMap((config) => config.tools.map((t) => t.name));
check("fetch_url is offered to no agent", !offered.includes("fetch_url"));
check("load_document is offered to the document agent only", agentToolsets.documentAnalysis.tools.some((t) => t.name === "load_document") && offered.filter((n) => n === "load_document").length === 1);

finishChecks();
