// Step 6 — The full pipeline on the broad topic, plus a trace of where a category gets lost.
//
// All six categories in REQUIRED must survive. The interesting part is not the pass/fail line but
// the trace: when a category is missing, the question is WHERE it was lost. There are only a few
// places, and telling them apart is the whole diagnostic skill.

import { check, finishChecks } from "../../_shared/check.js";
import { runCoordinator, evaluateCoverage, COVERAGE_THRESHOLD } from "./coordinator.js";

const REQUIRED = ["solar", "wind", "geothermal", "tidal", "biomass", "fusion"];

const report = await runCoordinator("renewable energy technologies", {
  // Without this the decomposition excludes fusion — correctly, by a strict reading of
  // "renewable". A contested boundary is a decision, and the requester makes it. The note states a
  // rule and never names fusion; the model applies the rule.
  scopeNote:
    "Include every technology proposed as a long-term primary energy source that is not fossil " +
    "fuel based, whether or not it meets a strict definition of 'renewable'. Pre-commercial and " +
    "contested candidates are in scope and must be listed with a caveat, not excluded.",
  // Enough budget for every subtopic. With a lower budget, whether a category gets researched
  // depends on where it happens to fall in the list, and this test would measure that instead.
  maxDelegations: 40,
  maxRefinementRounds: 2,
  gapsPerRound: 4,
});

const inDecomposition = (category) =>
  report.subtopics.some((s) => `${s.title} ${s.scope}`.toLowerCase().includes(category));

const inFindings = (category) =>
  report.findings.some((f) => `${f.subtopic} ${f.claim} ${f.detail}`.toLowerCase().includes(category));

// Being listed under "Coverage limitations" is the opposite of being covered, so that section does
// not count. The earlier version of this check searched the whole text and could not see that.
const text = (report.text ?? "").toLowerCase();
const limitsAt = text.lastIndexOf("coverage limitations");
const body = limitsAt === -1 ? text : text.slice(0, limitsAt);
const inFinalReport = (category) => body.includes(category);

console.log(`\n${"=".repeat(70)}\nStep 6 — where did each category survive?\n${"=".repeat(70)}`);
console.log("category      decomposed  researched  in report   diagnosis");

const missing = [];
for (const category of REQUIRED) {
  const decomposed = inDecomposition(category);
  const researched = inFindings(category);
  const reported = inFinalReport(category);
  if (!reported || !researched) missing.push(category);

  // Different failure points, different fixes.
  const diagnosis = !decomposed
    ? "LOST IN DECOMPOSITION — the coordinator never named it"
    : !researched
      ? "LOST IN DELEGATION — decomposed but never assigned to a subagent"
      : !reported
        ? "LOST IN SYNTHESIS — researched but dropped from the write-up"
        : "ok";

  console.log(
    `${category.padEnd(13)} ${(decomposed ? "yes" : "NO ").padEnd(11)} ` +
      `${(researched ? "yes" : "NO ").padEnd(11)} ${(reported ? "yes" : "NO ").padEnd(11)} ${diagnosis}`
  );
}

console.log(
  `\n${missing.length === 0 ? "Full coverage of all six categories." : `Missing: ${missing.join(", ")}`}`
);
console.log(
  `coverage of the coordinator's own subtopics: ${(report.coverage.completeness * 100).toFixed(0)}% ` +
    `after ${report.refinementRounds} refinement round(s), ${report.subtopics.length} subtopics, ${report.findings.length} findings\n`
);

const uncovered = [...report.coverage.missing, ...report.coverage.partial];
const limitsText = limitsAt === -1 ? "" : text.slice(limitsAt);

check("All six categories were researched and written up", missing.length === 0, missing.join(", "));
check(
  "The coverage figure is what the code computes from the findings",
  evaluateCoverage(report).completeness === report.coverage.completeness
);
check(
  "Coverage assessment can say no",
  evaluateCoverage({ subtopics: [{ title: "A" }, { title: "B" }], findings: [] }).completeness === 0
);
check(
  "Refinement stopped for a stated reason",
  report.coverage.completeness >= COVERAGE_THRESHOLD || report.refinementRounds === 2,
  `${report.refinementRounds} rounds`
);
check(
  "Refinement targeted only gaps, never covered subtopics",
  report.refinementLog.every((round) => round.targeting.every((title) => !round.coveredBefore.includes(title)))
);
check("The written report has a coverage limitations section", limitsAt !== -1);
check(
  "Every subtopic left uncovered is named in that section",
  uncovered.every((title) => limitsText.includes(title.toLowerCase())),
  `${uncovered.length} uncovered`
);
finishChecks();
