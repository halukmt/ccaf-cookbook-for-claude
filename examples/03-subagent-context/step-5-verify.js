// Step 5 — verification. No API call: reads step 4's saved output. A naive verifyCitations()
// runs for comparison, but it can barely fail (see finding.js), so the verdict rests on verifyAttribution()
// and on showing that check forged reports it must reject.

import { readFileSync } from "node:fs";
import { check, finishChecks } from "../../_shared/check.js";
import { verifyAttribution, verifyCitations, extractClaims } from "./finding.js";

const { webSearchResults, docAnalysisResults, report } = JSON.parse(
  readFileSync(new URL("./step-4-results.json", import.meta.url), "utf8")
);

const allFindings = [...webSearchResults.findings, ...docAnalysisResults.findings];
const uncited = verifyCitations(report ?? "", allFindings);
const attribution = verifyAttribution(report ?? "", allFindings);

console.log(`${"=".repeat(70)}\nCitation audit\n${"=".repeat(70)}`);
console.log(`The naive check: ${extractClaims(report ?? "").length} sentences, ${uncited.length} uncited.`);
console.log("The stronger check:", JSON.stringify(attribution, null, 2));
console.log(`\nFindings the coordinator had, metadata intact:\n${JSON.stringify(allFindings, null, 2)}\n`);

// Forged reports. A check that cannot reject these proves nothing about the real one.
const web = webSearchResults.findings[0];
const doc = docAnalysisResults.findings[0];
const realClaims = `${web?.claim} ${doc?.claim}`;
const noCitations = verifyAttribution(realClaims, allFindings);
const onlyUrl = verifyAttribution(`${realClaims} See ${web?.source_url}.`, allFindings);
const inventedFigure = verifyAttribution(`${report}\n\nAdoption reached 97.3% worldwide.`, allFindings);
const uncitedFigure = verifyAttribution(`${report}\n\nRetained capacity was ${doc?.claim.match(/\d+/)?.[0]}% in pilots.`, allFindings);

check("There is a report to verify", report?.trim().length > 100);
check("There are findings from both sides", webSearchResults.findings.length > 0 && docAnalysisResults.findings.length > 0);
check("Every finding's source is cited in the report", attribution.uncitedFindings.length === 0, attribution.uncitedFindings.join("; "));
check("Every figure in the report comes from a finding", attribution.unsupportedNumbers.length === 0, attribution.unsupportedNumbers.join(", "));
check("Every paragraph with a figure carries a citation", attribution.uncitedParagraphs.length === 0, attribution.uncitedParagraphs.join(" | ").slice(0, 200));
check("The check rejects claims with no citations", noCitations.uncitedFindings.length === allFindings.length);
check("The check rejects a report citing only the URL, not the page", onlyUrl.uncitedFindings.length > 0);
check("The check rejects an invented figure", inventedFigure.unsupportedNumbers.includes("97.3"));
check("The check rejects a real figure with no citation beside it", uncitedFigure.uncitedParagraphs.length > 0);
check(
  "Known defect of the naive function: it passes the same forged report",
  verifyCitations(`${realClaims} See ${web?.source_url}.`, allFindings).length === 0
);
finishChecks();
