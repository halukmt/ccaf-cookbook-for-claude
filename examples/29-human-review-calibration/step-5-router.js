// Step 5: the review queue, and what calibrated priority is worth for limited capacity. Simulated, no model.

import { check, finishChecks } from "../../_shared/check.js";
import { buildCalibrationCurve, calibratedConfidence, calibratedThresholds, errorsCaught, pct, ReviewQueue, routingOutcome } from "./calibration.js";
import { productionSet, validationSet } from "./scenario.js";
import { fieldRows } from "./simulator.js";

const curve = buildCalibrationCurve(validationSet());
const rows = fieldRows(productionSet());
const TARGET = 0.97;
const thresholds = calibratedThresholds(curve, TARGET);

// Dynamic ordering, with a hand-made curve so the expected order is plain.
const known = {
  "invoice-date": { pooled: { accuracy: 0.97 }, bands: { 0.7: { accuracy: 0.97, total: 100, sparse: false } } },
  "international-date": { pooled: { accuracy: 0.45 }, bands: { 0.8: { accuracy: 0.45, total: 100, sparse: false } } },
  "receipt-amount": { pooled: { accuracy: 0.5 }, bands: { 0.5: { accuracy: 0, total: 30, sparse: false } } },
};
const queue = new ReviewQueue(known);
queue.add({ id: "A", documentType: "invoice", fieldType: "date", rawConfidence: 0.7 });
queue.add({ id: "B", documentType: "international", fieldType: "date", rawConfidence: 0.85 });
check("A raw 0.85 international outranks a raw 0.70 invoice", queue.queue[0].id === "B");
const first = queue.getNext();
queue.add({ id: "C", documentType: "receipt", fieldType: "amount", rawConfidence: 0.55 });
queue.add({ id: "D", documentType: "invoice", fieldType: "date", rawConfidence: 0.71 });
check("The next item comes off in priority order, not arrival order", first.id === "B" && queue.getNext().id === "C");
check("A later arrival overtakes one waiting", queue.queue[0].id === "A" && queue.length === 2);
check("Equal calibrated scores go lower raw score first", queue.getNext().id === "A" && queue.getNext().id === "D" && queue.getNext() === undefined);
const zero = new ReviewQueue(known);
check("A calibrated accuracy of 0 stays 0, not the raw score", zero.getCalibratedConfidence({ documentType: "receipt", fieldType: "amount", rawConfidence: 0.55 }) === 0);

// Thresholds, on separate production data. Calibrated policy against a single raw threshold of 0.80.
const calibratedPolicy = (row) => {
  const threshold = thresholds[`${row.documentType}-${row.fieldType}`];
  return threshold === null || threshold === undefined || row.rawConfidence < threshold;
};
const rawPolicy = (row) => row.rawConfidence < 0.8;
const calibrated = routingOutcome(rows, calibratedPolicy);
const raw = routingOutcome(rows, rawPolicy);
console.table([{ policy: "Raw score at 0.80", ...raw }, { policy: `Calibrated, ${TARGET * 100}% target`, ...calibrated }].map((r) => ({ policy: r.policy, reviewed: r.reviewed, automated: r.automated, automatedErrors: r.automatedErrors, automatedErrorRate: pct(r.automatedErrorRate), reviewShare: pct(r.reviewShare) })));

// A fair raw comparison: the raw threshold that sends the same number of fields to people.
const rawRanked = [...rows].sort((a, b) => a.rawConfidence - b.rawConfidence);
const sameVolumeIds = new Set(rawRanked.slice(0, calibrated.reviewed).map((row) => row.id));
const sameVolume = routingOutcome(rows, (row) => sameVolumeIds.has(row.id));
console.log(`Raw score given the same review volume (${sameVolume.reviewed}, up to raw ${rawRanked[calibrated.reviewed].rawConfidence}): ${sameVolume.automatedErrors} automated errors, ${pct(sameVolume.automatedErrorRate)}.`);

const internationalRows = rows.filter((row) => row.documentType === "international" && !rawPolicy(row));
const internationalAccuracy = internationalRows.filter((row) => row.correct).length / internationalRows.length;
console.log(`Raw 0.80 automates ${internationalRows.length} international fields, which are right ${pct(internationalAccuracy)} of the time.`);

// Capacity: everything that either policy would review, served in three orders.
const pool = rows.filter((row) => calibratedPolicy(row) || rawPolicy(row));
const CAPACITIES = [100, 300, 600, 1000];
const calibratedScore = (row) => calibratedConfidence(curve, row.documentType, row.fieldType, row.rawConfidence);
const orders = {
  arrival: (list) => list,
  raw: (list) => [...list].sort((a, b) => a.rawConfidence - b.rawConfidence),
  calibrated: (list) => {
    const q = new ReviewQueue(curve);
    list.forEach((row) => q.add(row));
    const out = [];
    while (q.length) out.push(q.getNext());
    return out;
  },
};
const results = CAPACITIES.map((capacity) => ({ capacity, ...Object.fromEntries(Object.entries(orders).map(([name, order]) => [name, errorsCaught(pool, capacity, order)])) }));
console.log(`\nReal errors a reviewer catches, from a pool of ${pool.length} fields holding ${pool.filter((r) => !r.correct).length} errors:`);
console.table(results);

check("The pool and its errors are real numbers", pool.length > 0 && pool.some((row) => !row.correct));
check("The calibrated policy lets fewer errors through automation", calibrated.automatedErrorRate < raw.automatedErrorRate, `${pct(calibrated.automatedErrorRate)} vs ${pct(raw.automatedErrorRate)}`);
check("The calibrated policy meets its target on data it never saw", 1 - calibrated.automatedErrorRate >= TARGET, pct(1 - calibrated.automatedErrorRate));
check("Raw 0.80 automates international fields that fail badly", internationalAccuracy < 0.8, pct(internationalAccuracy));
check("Priority beats arrival order at every capacity", results.every((r) => r.calibrated > r.arrival && r.raw > r.arrival));
check("Fixed seed: raw order wins at very small capacity, calibrated from 600 up", results[0].raw > results[0].calibrated && results[2].calibrated > results[2].raw && results[3].calibrated > results[3].raw, results.map((r) => `${r.capacity}: ${r.calibrated} vs ${r.raw}`).join(", "));

// One seed could be an accident, so the order comparison repeats over 20 production sets.
const ordered = (list, score) => [...list].sort((a, b) => score(a) - score(b) || a.rawConfidence - b.rawConfidence);
const SEEDS = 20;
const sums = CAPACITIES.map(() => ({ raw: 0, calibrated: 0 }));
for (let seed = 1; seed <= SEEDS; seed++) {
  const seedRows = fieldRows(productionSet(9000 + seed));
  const seedPool = seedRows.filter((row) => calibratedPolicy(row) || rawPolicy(row));
  CAPACITIES.forEach((capacity, i) => {
    sums[i].raw += errorsCaught(seedPool, capacity, (l) => ordered(l, (row) => row.rawConfidence));
    sums[i].calibrated += errorsCaught(seedPool, capacity, (l) => ordered(l, calibratedScore));
  });
}
const means = CAPACITIES.map((capacity, i) => ({ capacity, raw: (sums[i].raw / SEEDS).toFixed(1), calibrated: (sums[i].calibrated / SEEDS).toFixed(1) }));
console.log(`\nErrors caught, mean of ${SEEDS} production seeds:`);
console.table(means);
check("Over 20 seeds, calibrated order beats raw at 1000 reviews", Number(means[3].calibrated) > Number(means[3].raw));

// Where calibration earns its keep: the worst cell that still gets automated, at equal review volume.
function worstAutomatedCell(sendsToReview, minN = 20) {
  const cells = new Map();
  for (const row of rows.filter((r) => !sendsToReview(r))) {
    const key = `${row.documentType}-${row.fieldType}`;
    const cell = cells.get(key) ?? { key, correct: 0, n: 0 };
    cell.n++;
    if (row.correct) cell.correct++;
    cells.set(key, cell);
  }
  return [...cells.values()].filter((c) => c.n >= minN).map((c) => ({ ...c, accuracy: c.correct / c.n })).sort((a, b) => a.accuracy - b.accuracy)[0];
}
const worstCalibrated = worstAutomatedCell(calibratedPolicy);
const worstRaw = worstAutomatedCell((row) => sameVolumeIds.has(row.id));
const worstRaw80 = worstAutomatedCell(rawPolicy);
console.log(`Worst automated cell: calibrated ${worstCalibrated.key} ${pct(worstCalibrated.accuracy)} (n=${worstCalibrated.n}); raw at same volume ${worstRaw?.key} ${worstRaw ? pct(worstRaw.accuracy) : "-"} (n=${worstRaw?.n ?? 0}); raw at 0.80 ${worstRaw80.key} ${pct(worstRaw80.accuracy)} (n=${worstRaw80.n}).`);
check("At the same volume, calibrated automation and raw automation let through about the same total", Math.abs(calibrated.automatedErrors - sameVolume.automatedErrors) <= 20, `${calibrated.automatedErrors} vs ${sameVolume.automatedErrors}`);
check("No automated cell falls below 95% under calibration", worstCalibrated.accuracy >= 0.95, pct(worstCalibrated.accuracy));
check("Raw at 0.80 automates a cell far below that", worstRaw80.accuracy < 0.8, `${worstRaw80.key} ${pct(worstRaw80.accuracy)}`);
check("Calibrated score of a low band matches the real rate there", Math.abs(calibratedScore({ documentType: "international", fieldType: "date", rawConfidence: 0.85 }) - rows.filter((r) => r.documentType === "international" && r.fieldType === "date" && r.rawConfidence >= 0.8 && r.rawConfidence < 0.9).reduce((sum, r, _i, list) => sum + (r.correct ? 1 / list.length : 0), 0)) < 0.15);

finishChecks();
