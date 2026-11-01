// The claim-source mapping, its verification against the source documents, conflict handling and rendering.
// None of this calls a model. It is the part of the pipeline that can be trusted to do the same thing every time.

export const CLAIM_SOURCE_SCHEMA = {
  type: "object",
  properties: {
    claim: { type: "string", description: "One specific assertion. Without it there is nothing to check." },
    sourceUrl: { type: "string", description: "Where it was found, exactly as given, so a reader can go there." },
    documentName: { type: "string", description: "The source title, for a reader who cannot follow a URL." },
    relevantExcerpt: { type: "string", description: "A passage copied word for word from the source, which proves the claim." },
    publicationDate: { type: "string", description: "ISO date of the source. Two different numbers may be a trend and not a conflict." },
    measure: {
      enum: ["adoption_rate", "migration_budget", "migration_duration", "gateways_patched", "none"],
      description: "What quantity the claim reports. Added to the five required fields, so that overlapping claims can be compared.",
    },
    value: { type: ["string", "null"], description: "The reported value, copied as written, such as 38%. Null when measure is none." },
  },
  required: ["claim", "sourceUrl", "documentName", "relevantExcerpt", "publicationDate", "measure", "value"],
};

const squash = (text) => String(text).replace(/\s+/g, " ").trim().toLowerCase();
const numbersIn = (text) => [...String(text).matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/[,.]$/, ""));

// Every field checked against the document the claim says it came from. Returns problems, empty when it holds.
export function mappingProblems(finding, documents) {
  const problems = [];
  for (const field of CLAIM_SOURCE_SCHEMA.required) {
    if (field === "value") continue;
    if (typeof finding[field] !== "string" || !finding[field].trim()) problems.push(`missing ${field}`);
  }
  const doc = documents.find((d) => d.url === finding.sourceUrl);
  if (!doc) return [...problems, `unknown source ${finding.sourceUrl}`];
  if (finding.documentName !== doc.title) problems.push(`document name differs: ${finding.documentName}`);
  if (finding.publicationDate !== doc.date) problems.push(`date differs: ${finding.publicationDate} vs ${doc.date}`);
  if (!squash(doc.text).includes(squash(finding.relevantExcerpt))) problems.push("the excerpt is not in the source");
  for (const number of numbersIn(finding.claim)) {
    if (!squash(doc.text).includes(squash(number))) problems.push(`claim number ${number} is not in the source`);
  }
  if (finding.value && !squash(doc.text).includes(squash(finding.value))) problems.push(`value ${finding.value} is not in the source`);
  return problems;
}

// Numbered in order, because these numbers are the citations. The references section is built here, never by the model.
export const numberFindings = (findings) => findings.map((finding, index) => ({ ...finding, n: index + 1 }));

export function renderReferences(findings) {
  return "## References\n" + findings.map((f) => `[${f.n}] ${f.documentName}, ${f.publicationDate}. ${f.sourceUrl}\n    "${f.relevantExcerpt}"`).join("\n");
}

// Sentences of the model's prose. Headings and blank lines are not claims.
export function sentencesOf(report) {
  return report
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^\|?[-:| ]+\|?$/.test(line) && !/^\*\*[^*]+\*\*:?$/.test(line))
    .flatMap((line) => line.replace(/^[-*]\s+/, "").split(/(?<=[.!?]|\])\s+(?=[A-Z"$\d])/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 15 && /[a-z]/i.test(sentence));
}

const citationsIn = (sentence) => [...sentence.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

// The real test. A sentence passes only when its citations exist and each number it states is in a claim or excerpt it
// cites. A check looking for a URL anywhere in the text passes a report in which every claim is cited to the wrong source.
export function verifyProvenance(report, findings) {
  const byN = new Map(findings.map((f) => [f.n, f]));
  const uncited = [];
  const unknownCitations = [];
  const unsupportedNumbers = [];
  const cited = new Set();

  for (const sentence of sentencesOf(report)) {
    const citations = citationsIn(sentence);
    if (citations.length === 0) {
      uncited.push(sentence);
      continue;
    }
    const known = citations.filter((n) => byN.has(n));
    for (const n of citations) if (!byN.has(n)) unknownCitations.push({ sentence, citation: n });
    known.forEach((n) => cited.add(n));
    const support = known.map((n) => `${byN.get(n).claim} ${byN.get(n).relevantExcerpt} ${byN.get(n).publicationDate}`).join(" ");
    const stated = numbersIn(sentence.replace(/\[\d+\]/g, ""));
    for (const number of stated) {
      if (!squash(support).includes(squash(number))) unsupportedNumbers.push({ sentence, number, citations });
    }
  }
  const dropped = findings.filter((f) => !cited.has(f.n)).map((f) => f.n);
  return { sentences: sentencesOf(report).length, uncited, unknownCitations, unsupportedNumbers, dropped, citationCount: cited.size };
}

// A marker counter, kept to show its weakness. It counts citation markers, so wrong ones count as well.
export const naiveProvenance = (report, findings) => ({ citationCount: (report.match(/\[\d+\]/g) ?? []).length, claimCount: findings.length });
// A weaker check again: any source URL anywhere in the text.
export const anyUrlPresent = (report, findings) => findings.some((f) => report.includes(f.sourceUrl));

// Groups by reported quantity, not by claim text: two wordings of one value are no conflict. Both values always stay.
export function handleConflicts(findings) {
  const byMeasure = new Map();
  for (const finding of findings) {
    if (finding.measure === "none" || !finding.value) continue;
    if (!byMeasure.has(finding.measure)) byMeasure.set(finding.measure, []);
    byMeasure.get(finding.measure).push(finding);
  }
  const groups = [];
  for (const [measure, claims] of byMeasure) {
    const uniqueValues = [...new Set(claims.map((c) => squash(c.value)))];
    if (uniqueValues.length < 2) {
      groups.push({ measure, claims, conflictDetected: false });
      continue;
    }
    const dates = [...new Set(claims.map((c) => c.publicationDate))].sort();
    const gapDays = (new Date(dates.at(-1)) - new Date(dates[0])) / 86400000;
    const listing = claims.map((entry) => `${entry.documentName} (${entry.publicationDate}): ${entry.value} [${entry.n}]`).join(" vs ");
    const reason = gapDays >= 60
      ? `The sources are ${Math.round(gapDays)} days apart, so this may be a change over time and not a contradiction.`
      : `The sources are only ${Math.round(gapDays)} days apart, so timing is unlikely to explain it. Compare their methods and scope.`;
    groups.push({ measure, claims, conflictDetected: true, gapDays, values: claims.map((c) => ({ value: c.value, n: c.n, date: c.publicationDate })), possibleExplanation: `Values differ. ${listing}. ${reason}` });
  }
  return groups;
}

export function renderConflicts(groups) {
  const conflicts = groups.filter((g) => g.conflictDetected);
  return "## Conflicting sources\n" + (conflicts.length ? conflicts.map((c) => `- ${c.measure}: ${c.possibleExplanation}`).join("\n") : "None detected.");
}

// Each value must be stated in a sentence that cites its own source, and neither value may be missing.
export function conflictProblems(report, groups) {
  const problems = [];
  const sentences = sentencesOf(report);
  for (const group of groups.filter((g) => g.conflictDetected)) {
    for (const { value, n } of group.values) {
      const found = sentences.some((s) => squash(s).includes(squash(value)) && citationsIn(s).includes(n));
      if (!found) problems.push(`${group.measure}: value ${value} is not stated with its citation [${n}]`);
    }
  }
  return problems;
}

// A rough rule: money or percentages mean financial, then technical words, else news. A table belongs to money
// only, so the number test stays narrow, and an explicit type would be better still where one exists.
export function detectContentType(claims) {
  const isMoney = claims.some((c) => /\$|\d+%/.test(c.claim));
  const isTechnical = claims.some((c) => /API|architecture|pattern|config|token|batch|version|spec|server|gateway handling/i.test(c.claim));
  if (isMoney) return "financial";
  if (isTechnical) return "technical";
  return "news";
}

export function renderSection(part) {
  const cite = (entry) => `[${entry.n}]`;
  switch (part.contentType) {
    case "financial":
      return "| Year | Value | Source |\n|---|---|---|\n" +
        part.claims.map((entry) => `| ${entry.publicationDate.slice(0, 4)} | ${entry.value ?? entry.claim} | ${entry.documentName} ${cite(entry)} |`).join("\n");
    case "news":
      return part.claims.map((entry) => `${entry.claim.replace(/\.$/, "")} (${entry.documentName}, ${entry.publicationDate}) ${cite(entry)}.`).join(" ");
    case "technical":
      return part.claims.map((entry) => `- ${entry.claim} ${cite(entry)}`).join("\n");
    default:
      throw new Error(`Unknown content type: ${part.contentType}`);
  }
}

export function groupByContentType(findings) {
  const sections = new Map();
  for (const finding of findings) {
    const type = detectContentType([finding]);
    if (!sections.has(type)) sections.set(type, []);
    sections.get(type).push(finding);
  }
  return [...sections].map(([contentType, claims]) => ({ contentType, claims }));
}
