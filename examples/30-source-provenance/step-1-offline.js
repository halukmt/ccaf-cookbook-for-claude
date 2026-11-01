// Step 1 and all the checkers, tested on hand-made data with no model. A checker that passes everything would look
// the same as one that works, so each is shown a forged input it must reject.

import { check, finishChecks } from "../../_shared/check.js";
import { DOCUMENTS, findDocumentById } from "../../_fixtures/research.js";
import { CONFLICT_DOCUMENTS, KNOWN_CONFLICTS } from "../../_fixtures/research-conflicts.js";
import { anyUrlPresent, CLAIM_SOURCE_SCHEMA as SCHEMA, conflictProblems, detectContentType, handleConflicts, mappingProblems, naiveProvenance, numberFindings, renderSection, sentencesOf, verifyProvenance } from "./provenance.js";

const docs = [...DOCUMENTS, ...CONFLICT_DOCUMENTS];
const doc3 = docs.find((d) => d.id === "DOC-3");
const doc4 = docs.find((d) => d.id === "DOC-4");
const good = (doc, claim, excerpt, measure = "none", value = null) => ({ claim, sourceUrl: doc.url, documentName: doc.title, relevantExcerpt: excerpt, publicationDate: doc.date, measure, value });

// Step 1
check("The five required fields are required", ["claim", "sourceUrl", "documentName", "relevantExcerpt", "publicationDate"].every((f) => SCHEMA.required.includes(f)));
check("Each field has a description", Object.values(SCHEMA.properties).every((p) => p.description?.length > 15));
const f38 = good(doc3, "38% had adopted session tokens by April.", "38% had adopted session tokens", "adoption_rate", "38%");
const f61 = good(doc4, "61% had adopted session tokens by August.", "61% had adopted session tokens", "adoption_rate", "61%");
check("A correct mapping passes", mappingProblems(f38, docs).length === 0, mappingProblems(f38, docs).join("; "));
check("A wrong URL is caught", mappingProblems({ ...f38, sourceUrl: "https://made.up/x" }, docs).length > 0);
check("A wrong date is caught", mappingProblems({ ...f38, publicationDate: "2031-01-01" }, docs).some((p) => p.includes("date")));
check("A wrong document name is caught", mappingProblems({ ...f38, documentName: "Some report" }, docs).some((p) => p.includes("name")));
check("An invented excerpt is caught", mappingProblems({ ...f38, relevantExcerpt: "Nearly everyone adopted session tokens" }, docs).some((p) => p.includes("excerpt")));
check("A number that is not in the source is caught", mappingProblems({ ...f38, claim: "42% had adopted session tokens." }, docs).some((p) => p.includes("42%")));
check("A missing field is caught", mappingProblems({ ...f38, relevantExcerpt: "" }, docs).some((p) => p.includes("missing")));
check("The fixture's first document is reused", findDocumentById("DOC-1")?.date === "2031-03-14");
check("Every known conflict's values really are in their documents", Object.values(KNOWN_CONFLICTS).every((c) => Object.entries(c.values).every(([id, value]) => docs.find((d) => d.id === id).text.includes(value))));

// Provenance verification
const findings = numberFindings([f38, f61]);
const honest = "By April, 38% had adopted session tokens [1]. By August, 61% had [2].";
const pass = verifyProvenance(honest, findings);
check("An honest report passes", pass.uncited.length === 0 && pass.unknownCitations.length === 0 && pass.unsupportedNumbers.length === 0 && pass.dropped.length === 0);

const miscited = "By April, 61% had adopted session tokens [1]. By August, 38% had [2].";
const swapped = verifyProvenance(miscited, findings);
check("Numbers cited to the wrong source are caught", swapped.unsupportedNumbers.length === 2);
const urlInText = `Most firms have adopted session tokens. See ${doc3.url} and ${doc4.url}.`;
check("The URL check passes a report with no per-claim citation", anyUrlPresent(urlInText, findings) === true);
check("The real check catches that same report", verifyProvenance(urlInText, findings).uncited.length > 0);
check("A marker counter is fooled by swapped citations", naiveProvenance(miscited, findings).citationCount === naiveProvenance(miscited, findings).claimCount);
check("A citation to nothing is caught", verifyProvenance("All of it holds [9].", findings).unknownCitations.length === 1);
check("A dropped finding is caught", verifyProvenance("By April, 38% had adopted [1].", findings).dropped.join() === "2");
check("An uncited sentence is caught", verifyProvenance("Research shows adoption is growing fast. 38% adopted [1]. 61% adopted [2].", findings).uncited.length === 1);
check("A heading does not count as a sentence", sentencesOf("## Adoption overview\nBy April, 38% adopted [1].").length === 1);

// Conflicts
const groups = handleConflicts(findings);
check("Two values for one measure are a conflict", groups[0].conflictDetected && groups[0].values.length === 2);
check("Both values stay in the explanation", groups[0].possibleExplanation.includes("38%") && groups[0].possibleExplanation.includes("61%"));
check("A wide date gap is offered as a possible trend", /change over time/.test(groups[0].possibleExplanation));
const sameDay = numberFindings([good(doc3, "Budget was $120,000.", "$120,000", "migration_budget", "$120,000"), { ...good(doc3, "Budget was $210,000.", "$120,000", "migration_budget", "$210,000") }]);
check("A close date gap points at the method, not time", /timing is unlikely/.test(handleConflicts(sameDay)[0].possibleExplanation));
check("Same value in other words is no conflict", !handleConflicts(numberFindings([f38, { ...f38, claim: "Over a third adopted." }]))[0].conflictDetected);
check("Stating only one value is caught", conflictProblems("By April, 38% had adopted [1].", groups).length === 1);
check("Stating both, each cited, passes", conflictProblems(honest, groups).length === 0);
check("Stating a value under the wrong citation is caught", conflictProblems(miscited, groups).length === 2);

// Rendering
const money = numberFindings([{ ...f38 }]);
const table = renderSection({ contentType: "financial", claims: money });
check("A table has the columns and a citation", table.startsWith("| Year | Value | Source |") && table.includes("[1]") && table.includes("2031"));
const techList = renderSection({ contentType: "technical", claims: money });
check("A technical section is a list with a citation", techList.startsWith("- ") && techList.includes("[1]"));
const prose = renderSection({ contentType: "news", claims: money });
check("News is prose with name, date and citation", !prose.startsWith("-") && !prose.startsWith("|") && prose.includes(doc3.title) && prose.includes(doc3.date) && prose.includes("[1]"));
check("Detection sends money to tables", detectContentType([{ claim: "Budget was $120,000." }]) === "financial");
check("Detection sends a technical fact to a list", detectContentType([{ claim: "Batch requests are retired." }]) === "technical");
check("Detection sends an event to prose", detectContentType([{ claim: "Two vendors shipped patches in May." }]) === "news");
let threw = false;
try { renderSection({ contentType: "chart", claims: money }); } catch { threw = true; }
check("An unknown type fails, not an empty section", threw);

finishChecks();
