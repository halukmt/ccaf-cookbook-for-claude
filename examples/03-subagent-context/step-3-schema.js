// Step 3 — the Finding schema, tested against realistic subagent output. No API call: this
// step is a data-shape design, and the parser only needs text to prove it works.

import { check, finishChecks } from "../../_shared/check.js";
import { FINDING_SCHEMA, parseFinding, parseFindings, toResearchOutput } from "./finding.js";

console.log("Finding schema (JSON Schema):");
console.log(JSON.stringify(FINDING_SCHEMA, null, 2));

const webSearchReply = `I found a relevant result.

\`\`\`json
{ "claim": "EU panel recycling targets rise to 80% by weight in 2026",
  "source_url": "https://example-energy-news.test/solar-recycling-2026",
  "confidence": "medium", "retrieved_by": "web-search" }
\`\`\``;

const docAnalysisReply = `Found this on page 2.

\`\`\`json
{ "claim": "Curtailment rose 15% year-over-year as storage lagged new capacity.",
  "document_name": "sample-report.md", "page_number": 2,
  "confidence": "medium", "retrieved_by": "doc-analysis" }
\`\`\``;

const malformedReply = "I looked into it but couldn't find anything conclusive, sorry.";
const badConfidenceReply = `\`\`\`json
{ "claim": "Something plausible.", "source_url": "https://example.test/x",
  "confidence": 0.7, "retrieved_by": "web-search" }
\`\`\``;
const brokenJsonReply = "```json\n{ \"claim\": \"cut off\n```";
const arrayReply = `\`\`\`json
[{ "claim": "One", "confidence": "high" }, { "claim": "Two", "confidence": "low" }, { "no_claim": true }]
\`\`\``;

const web = parseFinding(webSearchReply, "web-search");
const doc = parseFinding(docAnalysisReply, "doc-analysis");
const malformed = parseFinding(malformedReply, "web-search");
const badConfidence = parseFinding(badConfidenceReply, "web-search");

console.log(`\n${"=".repeat(70)}\nParsing subagent replies\n${"=".repeat(70)}`);
console.log("web-search reply   ->", web);
console.log("doc-analysis reply ->", doc);
console.log("malformed reply    ->", malformed);
console.log("bad confidence reply (0.7, a number, not \"high\"/\"medium\"/\"low\") ->", badConfidence);

const research = toResearchOutput([web], "EV battery second-life storage", "2026-08-09T00:00:00Z");
console.log(`\n${"=".repeat(70)}\nResearchOutput wrapper\n${"=".repeat(70)}`);
console.log(JSON.stringify(research, null, 2));
console.log("");

check("A web finding keeps its URL and has no page", web?.source_url.startsWith("https://") && web.page_number === null);
check("A document finding keeps its name and page", doc?.document_name === "sample-report.md" && doc.page_number === 2 && doc.source_url === "");
check("Free text with no JSON block gives null, not a finding", malformed === null);
check("Broken JSON gives null, not a throw", parseFinding(brokenJsonReply, "web-search") === null);
check("A confidence outside the enum becomes low", badConfidence?.confidence === "low");
check("retrieved_by comes from the caller, not the reply", parseFinding(webSearchReply, "someone-else").retrieved_by === "someone-else");
check("An array reply yields its valid items and drops the invalid one", parseFindings(arrayReply, "x").length === 2);
check("The wrapper keeps findings, query and timestamp", research.findings[0] === web && research.query && research.timestamp);
check("The schema requires the claim", FINDING_SCHEMA.required.includes("claim"));
finishChecks();
