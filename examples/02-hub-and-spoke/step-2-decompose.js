// Step 2 — Decomposition, checked against a fixed list of categories.
//
// The decomposition of "renewable energy technologies" is tested against the six categories in
// EXPECTED. Solar and wind arrive by themselves.
// The other four are the test — they are exactly what narrow decomposition drops.

import { check, finishChecks } from "../../_shared/check.js";
import { runCoordinator, MIN_SUBTOPICS } from "./coordinator.js";

const EXPECTED = ["solar", "wind", "geothermal", "tidal", "biomass", "fusion"];

// The scope note is the fix for a contested boundary. Without it the model reads "renewable
// energy technologies" by strict definition and excludes fusion — correctly, on its own terms.
// The list here uses a wider boundary, so the requester states it. Note what this is NOT:
// it does not name fusion. It states a rule; the model applies it.
const SCOPE_NOTE =
  "Include every technology proposed as a long-term primary energy source that is not fossil " +
  "fuel based, whether or not it meets a strict definition of 'renewable'. Pre-commercial and " +
  "contested candidates are in scope and must be listed with a caveat, not excluded.";

const report = await runCoordinator("renewable energy technologies", { scopeNote: SCOPE_NOTE });

const haystack = report.subtopics.map((s) => `${s.title} ${s.scope}`).join(" ").toLowerCase();

console.log("\ncoverage against the six target categories:");
const missing = [];
for (const category of EXPECTED) {
  const found = haystack.includes(category);
  if (!found) missing.push(category);
  console.log(`  ${found ? "yes" : "NO "}  ${category}`);
}

console.log(
  `\n${report.subtopics.length} subtopics (minimum ${MIN_SUBTOPICS}), ` +
    `${missing.length === 0 ? "all six categories covered" : `missing: ${missing.join(", ")}`}\n`
);

const titles = report.subtopics.map((s) => s.title.toLowerCase());
check("At least the minimum number of subtopics", report.subtopics.length >= MIN_SUBTOPICS, String(report.subtopics.length));
check("Subtopic titles are distinct", new Set(titles).size === titles.length);
check("Every subtopic states a scope", report.subtopics.every((s) => s.scope.trim().length > 0));
check("The second pass reports what the first missed, in a usable field", Array.isArray(report.missingFromFirstPass), report.missingFromFirstPass.join(", ").slice(0, 150));
check("The scope note does not name the answer", !SCOPE_NOTE.toLowerCase().includes("fusion"));
check("All six named categories reach the decomposition", missing.length === 0, missing.join(", "));
finishChecks();
