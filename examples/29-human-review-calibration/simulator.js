// A seeded mock of an extraction system. EVERYTHING HERE IS SIMULATED: the accuracies and confidences are parameters I
// chose, so a table made from this data shows how the method behaves. It says nothing about any real model.
//
// Each cell has its own relation between reported confidence and being right, so the same score means different
// things in different cells. Runs repeat exactly for a given seed.

export const FIELDS = ["vendorName", "date", "amount"];

export const DOC_TYPES = {
  // Well calibrated, and a small share report low scores while still mostly being right.
  invoice: { share: 0.8, cells: { vendorName: { confidence: 0.98, accuracy: 0.995 }, date: { confidence: 0.95, accuracy: 0.985 }, amount: { confidence: 0.97, accuracy: 0.99 } }, lowShare: 0.06 },
  // Low scores, and accuracy to match.
  receipt: { share: 0.1, cells: { vendorName: { confidence: 0.71, accuracy: 0.62 }, date: { confidence: 0.6, accuracy: 0.55 }, amount: { confidence: 0.55, accuracy: 0.48 } } },
  // Underconfident: right more often than it says.
  scannedPdf: { share: 0.06, cells: { vendorName: { confidence: 0.8, accuracy: 0.86 }, date: { confidence: 0.72, accuracy: 0.8 }, amount: { confidence: 0.69, accuracy: 0.72 } } },
  // Overconfident: the dangerous one. High scores with poor accuracy.
  international: { share: 0.04, cells: { vendorName: { confidence: 0.85, accuracy: 0.7 }, date: { confidence: 0.78, accuracy: 0.45 }, amount: { confidence: 0.8, accuracy: 0.55 } } },
};

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value) => Math.min(0.999, Math.max(0.01, value));
const round = (value) => Math.round(value * 1000) / 1000;

function pickType(random) {
  let roll = random();
  for (const [type, spec] of Object.entries(DOC_TYPES)) {
    roll -= spec.share;
    if (roll < 0) return type;
  }
  return "invoice";
}

// The extraction is wrong sometimes. A mock that always returned the true value would always measure 100%.
function extractField(truth, cell, lowShare, random) {
  const isLow = lowShare && random() < lowShare;
  const center = isLow ? cell.confidence - 0.28 : cell.confidence;
  const confidence = clamp(center + (random() - 0.5) * 0.2);
  // Within a cell, a higher score still means a better chance of being right.
  const chance = (isLow ? cell.accuracy - 0.1 : cell.accuracy) + (confidence - center) * 0.6;
  const correct = random() < chance;
  return { value: correct ? truth : `${truth}#wrong`, confidence: round(confidence) };
}

export function generateDocuments(count, seed) {
  const random = seededRandom(seed);
  const documents = [];
  for (let i = 0; i < count; i++) {
    const documentType = pickType(random);
    const truth = { vendorName: `Vendor ${i % 97}`, date: `2031-0${(i % 9) + 1}-1${i % 9}`, amount: `${100 + (i % 500)}.00` };
    const spec = DOC_TYPES[documentType];
    const extraction = { id: `${seed}-${i}`, documentType };
    for (const field of FIELDS) extraction[field] = extractField(truth[field], spec.cells[field], spec.lowShare, random);
    extraction.overallConfidence = Math.min(...FIELDS.map((field) => extraction[field].confidence));
    documents.push({ extraction, truth });
  }
  return documents;
}

// Forced: a novel fault hits this share of invoices, turning amounts wrong while their scores stay high.
export function injectDrift(documents, share, seed) {
  const random = seededRandom(seed);
  return documents.map((doc) => {
    if (doc.extraction.documentType !== "invoice" || random() >= share) return doc;
    const extraction = { ...doc.extraction, drifted: true, amount: { value: `${doc.truth.amount}#drift`, confidence: 0.97 } };
    extraction.overallConfidence = Math.min(...FIELDS.map((field) => extraction[field].confidence));
    return { ...doc, extraction };
  });
}

export const isCorrect = (doc, field) => doc.extraction[field].value === doc.truth[field];

// Field-level rows, the unit both the curve and the queue work on.
export const fieldRows = (documents) => documents.flatMap((doc) => FIELDS.map((field) => ({
  id: `${doc.extraction.id}-${field}`, documentType: doc.extraction.documentType, fieldType: field,
  rawConfidence: doc.extraction[field].confidence, correct: isCorrect(doc, field),
})));
