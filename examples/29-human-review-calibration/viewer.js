// Adapter between the central server and the calibration code. Everything is calculated on request from seeded
// simulated data, so this page has no model calls and no cost.

import { accuracyTable, buildCalibrationCurve, calibratedConfidence, calibratedThresholds, errorsCaught, pct, ReviewQueue, routingOutcome, stratifiedSample, trackAccuracy, worstCell } from "./calibration.js";
import { productionSet, validationSet, VALIDATION_SEED, PRODUCTION_SEED } from "./scenario.js";
import { fieldRows, injectDrift } from "./simulator.js";

const number = (params, name, fallback, min, max) => {
  const value = Number(params.get(name));
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

export async function run(params, emit) {
  const seed = number(params, "seed", PRODUCTION_SEED, 1, 1e9);
  const capacity = number(params, "capacity", 300, 1, 5000);
  const target = number(params, "target", 0.97, 0.5, 0.999);
  const raw = number(params, "rawThreshold", 0.8, 0.01, 0.99);
  const validation = validationSet(VALIDATION_SEED);
  const production = productionSet(seed);
  const curve = buildCalibrationCurve(validation);
  const rows = fieldRows(production);

  emit({ type: "card", title: "All of this is simulated", badge: `seed ${seed}`, tone: "warn", text: "Accuracies and confidences come from parameters in simulator.js. Results show how the method behaves, not how any real model does." });

  const stats = trackAccuracy(production);
  const worst = worstCell(stats);
  emit({ type: "section", title: "What the aggregate hides", text: "Fields compared with known truth." });
  emit({ type: "summary", items: [[pct(stats.aggregate.accuracy), `aggregate, n=${stats.aggregate.total}`], [pct(worst.accuracy), `worst cell: ${worst.cell}, n=${worst.total}`]] });
  emit({ type: "card", title: "By document type and field", tone: "muted", data: accuracyTable(stats).map((row) => `${row.type.padEnd(14)} ${row.vendorName.padEnd(18)} ${row.date.padEnd(18)} ${row.amount}`).join("\n") });

  emit({ type: "section", title: "What a raw score means", text: "The same raw score, looked up on the labelled validation set." });
  for (const [type, field, score] of [["invoice", "date", 0.75], ["international", "date", 0.85], ["scannedPdf", "amount", 0.75]]) {
    emit({ type: "card", title: `${type}, ${field}, raw ${score}`, badge: `really ${pct(calibratedConfidence(curve, type, field, score))}`, tone: "tool" });
  }

  const thresholds = calibratedThresholds(curve, target);
  const calibratedPolicy = (row) => {
    const threshold = thresholds[`${row.documentType}-${row.fieldType}`];
    return threshold === null || threshold === undefined || row.rawConfidence < threshold;
  };
  const rawPolicy = (row) => row.rawConfidence < raw;
  const a = routingOutcome(rows, calibratedPolicy);
  const b = routingOutcome(rows, rawPolicy);
  emit({ type: "section", title: "Routing", text: `Calibrated at a ${pct(target)} target, against one raw threshold of ${raw}. On separate data from the calibration.` });
  emit({ type: "summary", items: [[pct(a.automatedErrorRate), "errors in automation, calibrated"], [pct(b.automatedErrorRate), "errors in automation, raw"], [pct(a.reviewShare), "sent to people, calibrated"], [pct(b.reviewShare), "sent to people, raw"]] });

  const pool = rows.filter((row) => calibratedPolicy(row) || rawPolicy(row));
  const byCalibrated = (list) => {
    const queue = new ReviewQueue(curve);
    list.forEach((row) => queue.add(row));
    const out = [];
    while (queue.length) out.push(queue.getNext());
    return out;
  };
  const byRaw = (list) => [...list].sort((x, y) => x.rawConfidence - y.rawConfidence);
  emit({ type: "section", title: `A reviewer with capacity for ${capacity}`, text: `Real errors caught from ${pool.length} fields awaiting review.` });
  emit({ type: "summary", items: [
    [errorsCaught(pool, capacity, (list) => list), "arrival order"],
    [errorsCaught(pool, capacity, byRaw), "lowest raw score first"],
    [errorsCaught(pool, capacity, byCalibrated), "lowest calibrated score first"],
  ] });

  const drifted = injectDrift(production, 0.03, 11);
  const driftIds = new Set(drifted.filter((d) => d.extraction.drifted).map((d) => d.extraction.id));
  const { sample } = stratifiedSample(drifted.map((d) => d.extraction), { seed: 7 });
  const found = sample.filter((s) => driftIds.has(s.id));
  emit({ type: "section", title: "Forced drift: sampling high confidence", text: "3% of invoices get wrong amounts with confident scores. Only sampling automated items can see this." });
  emit({ type: "summary", items: [[driftIds.size, "drifted invoices"], [sample.length, "documents sampled"], [found.length, "drifted documents in the sample"], [found.filter((s) => s.stratum.endsWith("high")).length, "of those, automated"]] });
}
