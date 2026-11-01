// Tracking, calibration, sampling and routing. Pure calculation, with no model.

import { DOC_TYPES, FIELDS, fieldRows, isCorrect, seededRandom } from "./simulator.js";

export const MIN_BAND_N = 20;
export const pct = (rate) => `${(rate * 100).toFixed(1)}%`;

export function trackAccuracy(documents) {
  const stats = {};
  const total = { correct: 0, total: 0 };
  const byField = Object.fromEntries(FIELDS.map((field) => [field, { correct: 0, total: 0 }]));
  for (const doc of documents) {
    const key = doc.extraction.documentType;
    stats[key] ??= Object.fromEntries(FIELDS.map((field) => [field, { correct: 0, total: 0 }]));
    for (const field of FIELDS) {
      const correct = isCorrect(doc, field) ? 1 : 0;
      for (const bucket of [stats[key][field], total, byField[field]]) {
        bucket.total++;
        bucket.correct += correct;
      }
    }
  }
  const rate = (bucket) => ({ ...bucket, accuracy: bucket.total ? bucket.correct / bucket.total : null });
  return {
    types: Object.fromEntries(Object.entries(stats).map(([type, fields]) => [type, Object.fromEntries(Object.entries(fields).map(([field, bucket]) => [field, rate(bucket)]))])),
    byField: Object.fromEntries(Object.entries(byField).map(([field, bucket]) => [field, rate(bucket)])),
    aggregate: rate(total),
  };
}

export function accuracyTable(stats) {
  const row = (name, cells) => ({ type: name, ...Object.fromEntries(FIELDS.map((field) => [field, cells[field] ? `${pct(cells[field].accuracy)} (n=${cells[field].total})` : "-"])) });
  return [...Object.keys(DOC_TYPES).filter((type) => stats.types[type]).map((type) => row(type, stats.types[type])), row("ALL", stats.byField)];
}

export function worstCell(stats) {
  const cells = Object.entries(stats.types).flatMap(([type, fields]) => Object.entries(fields).map(([field, bucket]) => ({ cell: `${type}-${field}`, ...bucket })));
  return cells.sort((a, b) => a.accuracy - b.accuracy)[0];
}

export const bandOf = (confidence) => Math.min(9, Math.floor(confidence * 10)) / 10;

export function buildCalibrationCurve(documents) {
  const curve = {};
  for (const row of fieldRows(documents)) {
    const key = `${row.documentType}-${row.fieldType}`;
    curve[key] ??= { pooled: { correct: 0, total: 0 }, bands: {} };
    const band = (curve[key].bands[bandOf(row.rawConfidence)] ??= { correct: 0, total: 0 });
    for (const bucket of [band, curve[key].pooled]) {
      bucket.total++;
      bucket.correct += row.correct ? 1 : 0;
    }
  }
  for (const cell of Object.values(curve)) {
    cell.pooled.accuracy = cell.pooled.correct / cell.pooled.total;
    for (const band of Object.values(cell.bands)) {
      band.accuracy = band.correct / band.total;
      band.sparse = band.total < MIN_BAND_N;
    }
  }
  return curve;
}

// Lookup: the band's own rate when it has enough data, otherwise the whole cell's. Null when the cell is unknown.
export function calibratedConfidence(curve, documentType, fieldType, rawConfidence) {
  const cell = curve[`${documentType}-${fieldType}`];
  if (!cell) return null;
  const band = cell.bands[bandOf(rawConfidence)];
  return band && !band.sparse ? band.accuracy : cell.pooled.accuracy;
}

// The lowest band from which all higher bands with data reach the target. Null means always review this cell.
export function calibratedThresholds(curve, target) {
  const thresholds = {};
  for (const [key, cell] of Object.entries(curve)) {
    const reliable = Object.entries(cell.bands).filter(([, band]) => !band.sparse).map(([band, data]) => [Number(band), data.accuracy]).sort((a, b) => b[0] - a[0]);
    let threshold = null;
    for (const [band, accuracy] of reliable) {
      if (accuracy < target) break;
      threshold = band;
    }
    thresholds[key] = threshold;
  }
  return thresholds;
}

// Proportional to volume within each stratum, with at least one from every stratum, high confidence included.
export function stratifiedSample(extractions, { sampleRate = 0.05, seed = 1, highThreshold = 0.8 } = {}) {
  const random = seededRandom(seed);
  const strata = {};
  for (const extraction of extractions) {
    const key = `${extraction.documentType}-${extraction.overallConfidence >= highThreshold ? "high" : "low"}`;
    (strata[key] ??= []).push(extraction);
  }
  const shuffleAndTake = (items, n) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };
  const sample = [];
  const sizes = {};
  for (const [stratum, members] of Object.entries(strata)) {
    const n = Math.max(1, Math.round(members.length * sampleRate));
    sizes[stratum] = { population: members.length, sampled: n };
    sample.push(...shuffleAndTake(members, n).map((item) => ({ ...item, stratum })));
  }
  return { sample, sizes };
}

// Lowest calibrated confidence first. Stored sorted, so a new arrival can overtake anything already waiting.
export class ReviewQueue {
  constructor(curve, { useCalibrated = true } = {}) {
    this.queue = [];
    this.curve = curve;
    this.useCalibrated = useCalibrated;
  }

  // `??`, not `||`: with `||`, a calibrated accuracy of 0, the worst possible, would fall back to the raw score.
  getCalibratedConfidence(row) {
    if (!this.useCalibrated) return row.rawConfidence;
    return calibratedConfidence(this.curve, row.documentType, row.fieldType, row.rawConfidence) ?? row.rawConfidence;
  }

  add(row) {
    const item = { ...row, priorityScore: this.getCalibratedConfidence(row), arrival: this.arrival = (this.arrival ?? 0) + 1 };
    // Many items share a band's score. Within one, the raw score still carries information, so it breaks the tie.
    const at = this.queue.findIndex((other) => other.priorityScore > item.priorityScore
      || (other.priorityScore === item.priorityScore && other.rawConfidence > item.rawConfidence));
    if (at === -1) this.queue.push(item);
    else this.queue.splice(at, 0, item);
  }

  getNext() {
    return this.queue.shift();
  }

  get length() {
    return this.queue.length;
  }
}

// Which rows a policy sends to people, and how wrong the rest turn out.
export function routingOutcome(rows, sendsToReview) {
  const reviewed = rows.filter(sendsToReview);
  const automated = rows.filter((row) => !sendsToReview(row));
  const errors = automated.filter((row) => !row.correct).length;
  return {
    reviewed: reviewed.length, automated: automated.length, automatedErrors: errors,
    automatedErrorRate: automated.length ? errors / automated.length : 0,
    reviewShare: reviewed.length / rows.length,
    errorsSentToReview: reviewed.filter((row) => !row.correct).length,
    totalErrors: rows.filter((row) => !row.correct).length,
  };
}

// How many real errors a capacity-limited reviewer catches, for a given serving order.
export function errorsCaught(rows, capacity, order) {
  return order(rows).slice(0, capacity).filter((row) => !row.correct).length;
}
