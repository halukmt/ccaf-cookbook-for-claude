// Step 4: per-file review with a confidence and reasoning on every finding, and routing at 0.80. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL } from "../../_shared/client.js";
import { loadPr, scorePr } from "./pr.js";
import { BANDS, THRESHOLD, bandLabel, bandOf, reviewWithConfidence, routeFinding } from "./passes.js";

const store = resultStore(import.meta.url);
const reviews = await store.runOnce("confidence-reviews", () => reviewWithConfidence(loadPr()));
const findings = reviews.flatMap((r) => r.issues).map((f) => routeFinding(f));

console.table(BANDS.map((band) => ({ band: bandLabel(band), findings: findings.filter((f) => bandOf(f.confidence) === band).length })));
const direct = findings.filter((f) => f.route === "direct_report");
const queue = findings.filter((f) => f.route === "human_review");
console.log(`At ${THRESHOLD}: ${direct.length} go to the developer, ${queue.length} to the human queue, of ${findings.length}.`);
console.log("Example:", JSON.stringify(queue[0] ?? direct[0], null, 1));
const score = scorePr(findings);
console.log(`Planted defects: ${score.local.length} local, ${score.cross.length} cross-file. Computed cost ${usd(estimateCost(MODEL, reviews.reduce((t, r) => addUsage(t, r.usage), {})))}.`);

const matched = (list) => list.filter((f) => scorePr([f]).found.size > 0).length;
console.log(`Findings matching a planted defect: direct ${matched(direct)} of ${direct.length}, queue ${matched(queue)} of ${queue.length}.`);

check("Every pass finished normally", reviews.every((r) => r.stopReason === "end_turn" && r.brokenLines === 0));
check("There are findings", findings.length > 0);
check("Every finding has a confidence between 0 and 1", findings.every((f) => typeof f.confidence === "number" && f.confidence >= 0 && f.confidence <= 1));
check("Every finding has reasoning and a severity", findings.every((f) => f.reasoning?.length > 10 && f.severity));
check("Routing follows the threshold", routeFinding({ confidence: 0.8 }).route === "direct_report" && routeFinding({ confidence: 0.79 }).route === "human_review");
check("Every finding has exactly one route", direct.length + queue.length === findings.length);
finishChecks();
