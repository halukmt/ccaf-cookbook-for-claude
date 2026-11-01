// Turns saved review results into the comparison numbers. Pure functions, no model.

import { DEFECTS, defectFiles, defectLine, defectsMatchedBy, loadCodebase, scoreFindings } from "../../_fixtures/codebase-answers.js";
import { positionSlope, stdDev } from "./review.js";

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const issuesIn = (issues, file) => issues.filter((issue) => issue.file === file);

// For one list of findings: counts per file in review order, and how well each planted defect was located.
export function profile(issues, files) {
  const counts = files.map((file) => issuesIn(issues, file).length);
  const score = scoreFindings(issues);
  const recallPerFile = files.map((file) => {
    const planted = DEFECTS.filter((d) => d.scope === "local" && d.file === file);
    return planted.length ? planted.filter((d) => score.found.has(d.id)).length / planted.length : null;
  });
  const detailPerFile = files.map((file) => mean(issuesIn(issues, file).map((i) => (i.description ?? "").length)));
  const measuredRecall = recallPerFile.filter((value) => value !== null);

  const located = issues.flatMap((issue) =>
    defectsMatchedBy(issue)
      .filter((defect) => defect.file === issue.file)
      .map((defect) => Math.abs(issue.line - defectLine(defect)) <= 2)
  );

  return {
    total: issues.length,
    counts,
    score,
    stdDev: stdDev(counts),
    countSlope: positionSlope(counts),
    recallStdDev: stdDev(measuredRecall),
    detailSlope: positionSlope(detailPerFile),
    detailFirstHalf: mean(detailPerFile.slice(0, Math.floor(files.length / 2))),
    detailSecondHalf: mean(detailPerFile.slice(Math.floor(files.length / 2))),
    lineAccuracy: located.length ? located.filter(Boolean).length / located.length : 0,
    unmatched: score.unmatched.length,
  };
}

const foundIn = (score, scope) => DEFECTS.filter((d) => d.scope === scope && score.found.has(d.id)).map((d) => d.id);

export function buildComparison({ single, perFile, crossSummaries, crossContracts }) {
  const files = perFile.map((review) => review.fileName);
  const perFileIssues = perFile.flatMap((review) => review.issues);
  const singleProfile = profile(single.issues, files);
  const multiProfile = profile(perFileIssues, files);

  const defects = DEFECTS.map((d) => ({
    id: d.id,
    scope: d.scope,
    single: singleProfile.score.found.has(d.id),
    perFile: multiProfile.score.found.has(d.id),
    crossSummaries: scoreFindings(crossSummaries.issues).found.has(d.id),
    crossContracts: scoreFindings(crossContracts.issues).found.has(d.id),
  }));

  return {
    files,
    single: singleProfile,
    multi: multiProfile,
    defects,
    rows: files.map((file, i) => ({
      file,
      single: singleProfile.counts[i],
      multi: multiProfile.counts[i],
      plantedLocal: DEFECTS.filter((d) => d.scope === "local" && d.file === file).length,
    })),
    cross: {
      summaries: foundIn(scoreFindings(crossSummaries.issues), "cross-file"),
      contracts: foundIn(scoreFindings(crossContracts.issues), "cross-file"),
      single: foundIn(singleProfile.score, "cross-file"),
      perFile: foundIn(multiProfile.score, "cross-file"),
    },
  };
}

// The planted repeats, evaluated across one run: flagged in some files but passed over in others?
export function findContradictions(issues) {
  const patterns = [...new Set(DEFECTS.filter((d) => d.pattern).map((d) => d.pattern))];
  return patterns.map((pattern) => {
    const sites = DEFECTS.filter((d) => d.pattern === pattern).map((defect) => {
      const finding = issues.find((issue) => defectFiles(defect).includes(issue.file) && defect.match.test(issue.description ?? ""));
      return { file: defect.file, flagged: Boolean(finding), severity: finding?.severity ?? null };
    });
    const flagged = sites.filter((s) => s.flagged);
    return {
      pattern,
      sites,
      contradiction: flagged.length > 0 && flagged.length < sites.length,
      severities: [...new Set(flagged.map((s) => s.severity))],
    };
  });
}

// The same code on several lines, checked for one finding per occurrence. This is not a planted defect:
// it is the unplanned repeat observed in the results, three identical async handlers with no error handling.
export function handlerErrorCoverage(issues) {
  const source = loadCodebase().get("api-routes.js").split("\n");
  const handlers = source.flatMap((text, i) => (text.includes("async (req, res) =>") ? [i + 1] : []));
  const flagged = handlers.filter((line) =>
    issues.some(
      (issue) =>
        issue.file === "api-routes.js" && /error handling|try\/catch|unhandled/i.test(issue.description ?? "") &&
        issue.line >= line && issue.line <= line + 3
    )
  );
  return { handlers, flagged };
}
