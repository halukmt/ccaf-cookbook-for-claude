// Step 5: fresh instances judge a sample of findings, seeing only the file and the claim. Four false
// claims are mixed in, to prove the judge can say no. Paid once, one call after another.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL } from "../../_shared/client.js";
import { loadPr, scorePr } from "./pr.js";
import { CONTROLS, calibrationCurve, sampleForCalibration, verifyFinding } from "./passes.js";

const store = resultStore(import.meta.url);
const pr = loadPr();
const findings = store.load("confidence-reviews").flatMap((r) => r.issues);
const sample = sampleForCalibration(findings);

const lineOf = (control) => pr.get(control.file).split("\n").findIndex((line) => line.includes(control.anchor)) + 1;

const data = await store.runOnce("verifications", async () => {
  const rows = [];
  for (const finding of sample) {
    const { valid, assessment, usage } = await verifyFinding(pr.get(finding.file), finding);
    rows.push({ file: finding.file, line: finding.line, severity: finding.severity, description: finding.description, confidence: finding.confidence, reasoning: finding.reasoning, matchesKey: scorePr([finding]).found.size > 0, valid, assessment, usage });
  }
  const controls = [];
  for (const control of CONTROLS) {
    const claim = { ...control, line: lineOf(control) };
    const { valid, assessment, usage } = await verifyFinding(pr.get(control.file), claim);
    controls.push({ ...claim, valid, assessment, usage });
  }
  return { rows, controls };
});

const curve = calibrationCurve(data.rows);
console.table(curve.map((c) => ({ band: c.band, n: c.n, confirmed: c.confirmed, rate: c.confirmedRate === null ? "no findings" : `${(c.confirmedRate * 100).toFixed(0)}%`, matchPlantedDefect: c.keyMatches })));
console.log("Control claims, all false:");
console.table(data.controls.map((c) => ({ file: c.file, valid: c.valid, assessment: c.assessment.slice(0, 90) })));
const highOverturned = data.rows.filter((r) => r.confidence >= 0.8 && !r.valid);
const lowConfirmed = data.rows.filter((r) => r.confidence < 0.8 && r.valid);
console.log(`Overturned at 0.80 or above: ${highOverturned.length} of ${data.rows.filter((r) => r.confidence >= 0.8).length}.`);
console.table(highOverturned.map((r) => ({ file: r.file, confidence: r.confidence, finding: r.description.slice(0, 80), assessment: r.assessment.slice(0, 80) })));
console.log(`Confirmed below 0.80: ${lowConfirmed.length} of ${data.rows.filter((r) => r.confidence < 0.8).length}.`);

// A threshold is supported only by a band with enough findings and a high confirmed rate.
const MIN_SAMPLE = 5;
const TARGET = 0.9;
const supported = curve.filter((c) => c.n >= MIN_SAMPLE && c.confirmedRate >= TARGET);
console.log(`Bands with at least ${MIN_SAMPLE} findings confirmed at ${TARGET * 100}% or more: ${supported.map((c) => c.band).join(", ") || "none"}.`);
const usage = [...data.rows, ...data.controls].reduce((t, r) => addUsage(t, r.usage), {});
console.log(`Computed cost ${usd(estimateCost(MODEL, usage))} for ${data.rows.length + data.controls.length} fresh calls.`);
store.save("calibration", { curve, supported: supported.map((c) => c.band), overturned: highOverturned.length, sampleSize: data.rows.length, population: findings.length });

check("A sample was verified", data.rows.length >= 10, `${data.rows.length} of ${findings.length} findings`);
check("Each verification has an assessment", [...data.rows, ...data.controls].every((r) => typeof r.valid === "boolean" && r.assessment.length > 10));
check("The judge can say no: at least three of four false claims were rejected", data.controls.filter((c) => !c.valid).length >= 3, `${data.controls.filter((c) => !c.valid).length} of 4`);
check("The curve accounts for every sampled finding", curve.reduce((sum, c) => sum + c.n, 0) === data.rows.length);
check("Band arithmetic is right", calibrationCurve([{ confidence: 0.95, valid: true, matchesKey: true }, { confidence: 0.95, valid: false, matchesKey: false }])[4].confirmedRate === 0.5);
finishChecks();
