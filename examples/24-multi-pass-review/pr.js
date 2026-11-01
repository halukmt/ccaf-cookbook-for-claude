// The 10-file mock PR, taken from the shared codebase fixture, and scoring limited to it.
//
// Two of the twelve fixture files stay out: users.js and utils.js, the two whose removal leaves the most
// cross-file defects intact. reports.js and auth.js, each with a SQL injection, are placed 6th and 7th.
// Defects that need a removed file are left out of the score, so the denominators stay honest.

import { DEFECTS, defectFiles, loadCodebase, scoreFindings } from "../../_fixtures/codebase-answers.js";

export const PR_ORDER = ["api-routes.js", "cart.js", "config.js", "database.js", "inventory.js", "reports.js", "auth.js", "notifications.js", "orders.js", "payments.js"];

export function loadPr() {
  const all = loadCodebase();
  return new Map(PR_ORDER.map((name) => [name, all.get(name)]));
}

export const PR_DEFECTS = DEFECTS.filter((d) => defectFiles(d).every((file) => PR_ORDER.includes(file)));
export const LOCAL_DEFECTS = PR_DEFECTS.filter((d) => d.scope === "local");
export const CROSS_DEFECTS = PR_DEFECTS.filter((d) => d.scope === "cross-file");

export function scorePr(findings) {
  const { found, unmatched } = scoreFindings(findings);
  const inPr = new Set(PR_DEFECTS.filter((d) => found.has(d.id)).map((d) => d.id));
  return {
    found: inPr,
    local: LOCAL_DEFECTS.filter((d) => inPr.has(d.id)).map((d) => d.id),
    cross: CROSS_DEFECTS.filter((d) => inPr.has(d.id)).map((d) => d.id),
    missed: PR_DEFECTS.filter((d) => !inPr.has(d.id)).map((d) => d.id),
    unmatched: unmatched.length,
  };
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

// One row per file in review order: count, finding length as a rough depth proxy, planted local defects caught.
export function perFileProfile(findings) {
  const { found } = scoreFindings(findings);
  return PR_ORDER.map((file, i) => {
    const here = findings.filter((f) => f.file === file);
    const planted = LOCAL_DEFECTS.filter((d) => d.file === file);
    return {
      position: i + 1,
      file,
      findings: here.length,
      avgChars: Math.round(mean(here.map((f) => (f.description ?? "").length))),
      planted: planted.length,
      caught: planted.filter((d) => found.has(d.id)).length,
    };
  });
}

// The planted repeats in the PR: is the same mistake flagged everywhere, at comparable severity?
export function contradictions(findings) {
  const patterns = [...new Set(PR_DEFECTS.filter((d) => d.pattern).map((d) => d.pattern))];
  return patterns.map((pattern) => {
    const sites = PR_DEFECTS.filter((d) => d.pattern === pattern).map((defect) => {
      const finding = findings.find((f) => f.file === defect.file && defect.match.test(f.description ?? ""));
      return { file: defect.file, flagged: Boolean(finding), severity: finding?.severity ?? null };
    });
    const flagged = sites.filter((s) => s.flagged);
    return { pattern, sites, missedSomewhere: flagged.length > 0 && flagged.length < sites.length, severities: [...new Set(flagged.map((s) => s.severity))] };
  });
}
