// Steps 1 to 3: seeded mock extraction, per-cell accuracy, calibration curves. No model, no cost. All data is simulated.

import { check, finishChecks } from "../../_shared/check.js";
import { accuracyTable, bandOf, buildCalibrationCurve, calibratedConfidence, calibratedThresholds, MIN_BAND_N, pct, trackAccuracy, worstCell } from "./calibration.js";
import { productionSet, validationSet } from "./scenario.js";
import { DOC_TYPES, FIELDS, generateDocuments } from "./simulator.js";

const validation = validationSet();
const production = productionSet();

// Step 1
const again = generateDocuments(50, 1);
const same = generateDocuments(50, 1);
check("The same seed gives identical data", JSON.stringify(again) === JSON.stringify(same));
check("A different seed gives different data", JSON.stringify(again) !== JSON.stringify(generateDocuments(50, 2)));
check("Four document types appear", Object.keys(DOC_TYPES).every((type) => validation.some((d) => d.extraction.documentType === type)));
check("Every field has a value and a confidence between 0 and 1", validation.every((d) => FIELDS.every((f) => d.extraction[f].value && d.extraction[f].confidence > 0 && d.extraction[f].confidence < 1)));
const mean = (type, field) => {
  const rows = validation.filter((d) => d.extraction.documentType === type).map((d) => d.extraction[field].confidence);
  return rows.reduce((a, b) => a + b, 0) / rows.length;
};
console.table(Object.keys(DOC_TYPES).map((type) => ({ type, ...Object.fromEntries(FIELDS.map((f) => [f, mean(type, f).toFixed(3)])) })));
check("Confidence distributions differ by type", mean("invoice", "amount") - mean("receipt", "amount") > 0.3);

// Step 2, on production data
const stats = trackAccuracy(production);
console.log("\nAccuracy by type and field, with sample sizes:");
console.table(accuracyTable(stats));
const worst = worstCell(stats);
console.log(`Aggregate ${pct(stats.aggregate.accuracy)} over ${stats.aggregate.total} fields. Worst cell: ${worst.cell} at ${pct(worst.accuracy)} (n=${worst.total}).`);
check("Accuracy comes from comparing values, not from the parameters", stats.aggregate.correct > 0 && stats.aggregate.correct < stats.aggregate.total);
check("The aggregate looks excellent", stats.aggregate.accuracy >= 0.9, pct(stats.aggregate.accuracy));
check("Standard invoices are all 95% or better", FIELDS.every((f) => stats.types.invoice[f].accuracy >= 0.95));
check("Receipts or international documents show 40% to 70% cells", Object.values(stats.types.international).some((c) => c.accuracy >= 0.4 && c.accuracy <= 0.7) && Object.values(stats.types.receipt).some((c) => c.accuracy >= 0.4 && c.accuracy <= 0.7));
check("The worst cell is at least 30 points below the aggregate", stats.aggregate.accuracy - worst.accuracy >= 0.3, `${pct(stats.aggregate.accuracy)} vs ${pct(worst.accuracy)}`);
check("Cell counts add up to the aggregate", Object.values(stats.types).flatMap((f) => Object.values(f)).reduce((n, c) => n + c.total, 0) === stats.aggregate.total);
check("A broken extractor scores 0 and not a default", trackAccuracy([{ extraction: { documentType: "x", vendorName: { value: "a" }, date: { value: "b" }, amount: { value: "c" } }, truth: { vendorName: "z", date: "z", amount: "z" } }]).aggregate.accuracy === 0);

// Step 3, from validation data only
const curve = buildCalibrationCurve(validation);
const printable = Object.entries(curve).flatMap(([cell, data]) => Object.entries(data.bands).sort((a, b) => a[0] - b[0]).map(([band, b]) => ({ cell, band, accuracy: pct(b.accuracy), n: b.total, sparse: b.sparse ? "yes" : "" })));
console.log(`\nCalibration, validation set of ${validation.length} documents. Bands under ${MIN_BAND_N} are marked sparse:`);
console.table(printable);

const lookup = (type, field, raw) => calibratedConfidence(curve, type, field, raw);
const intlDate = lookup("international", "date", 0.85);
const invoiceDate = lookup("invoice", "date", 0.75);
console.log(`Same-ish score, different meaning: international date at raw 0.85 is really ${pct(intlDate)}; invoice date at raw 0.75 is really ${pct(invoiceDate)}.`);
check("A raw 0.85 on international means less than a raw 0.75 on invoices", intlDate < invoiceDate);
const raw85 = ["invoice", "scannedPdf", "international"].map((type) => lookup(type, "amount", 0.85));
check("One raw score maps to very different accuracy by type", Math.max(...raw85) - Math.min(...raw85) > 0.2, raw85.map(pct).join(", "));
check("Every field-type pair has a curve", Object.keys(curve).length === Object.keys(DOC_TYPES).length * FIELDS.length);
check("An unknown cell returns null, not a number", lookup("fax", "date", 0.9) === null);
const emptyBandCell = curve["invoice-date"];
const sparseBand = Object.entries(emptyBandCell.bands).find(([, band]) => band.sparse);
check("A sparse or missing band falls back to the whole cell", lookup("invoice", "date", 0.05) === emptyBandCell.pooled.accuracy && (!sparseBand || lookup("invoice", "date", Number(sparseBand[0]) + 0.01) === emptyBandCell.pooled.accuracy));
check("Band edges are right", bandOf(0.8) === 0.8 && bandOf(0.799) === 0.7 && bandOf(0.999) === 0.9);

const thresholds = calibratedThresholds(curve, 0.97);
console.log("\nAuto-accept thresholds for a 97% target. null means every value goes to a person:");
console.table(Object.entries(thresholds).map(([cell, threshold]) => ({ cell, threshold })));
check("Invoices can be automated at some score", ["vendorName", "date", "amount"].some((f) => thresholds[`invoice-${f}`] !== null));
check("International and receipts never reach the target", Object.entries(thresholds).filter(([k]) => /^(international|receipt)-/.test(k)).every(([, t]) => t === null));

finishChecks();
