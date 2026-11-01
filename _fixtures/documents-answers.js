// Answer key for _fixtures/documents/: invented invoices, receipts, reports and a contract with
// known fields, known gaps and known errors.
//
// The fixture is read-only for examples. Every extraction is scored with scoreExtraction(), which
// compares against this key field by field, so rates can be computed and not estimated.
//
// Key conventions:
// - null means the information is genuinely absent from the document. Any value there is fabricated.
// - line_items holds every charge that adds up to the total, including tax, shipping and discounts.
//   A subtotal is not a line item.
// - `unscored` lists fields where the key has no single defensible answer.
// - `errors` lists mistakes in the document itself. No correct extraction can make them go away.
// - `accept` lists other spellings that count as correct, such as a faithful copy of OCR noise.
// - `acceptAmounts` lists other fair ways to split the same charges into line items.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DOCUMENTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "documents");

const items = (...pairs) => pairs.map(([description, amount]) => ({ description, amount }));
const absent = {
  invoice_number: null, vendor_name: null, document_date: null, due_date: null, payment_terms: null,
  purchase_order: null, tax_id: null, currency: null, total_amount: null, line_items: [],
};

export const DOCUMENTS = [
  { id: "d01", file: "d01-northwind-invoice.txt", type: "invoice", structure: "table", segment: "standard", category: "invoice", fields: {
    invoice_number: "INV-2024-1041", vendor_name: "Northwind Office Supplies GmbH", document_date: "2024-03-15", due_date: "2024-04-14", payment_terms: "30",
    purchase_order: "PO-7781", tax_id: "DE811907980", currency: "EUR", total_amount: 428.4, line_items: items(["Copy paper", 120], ["Toner cartridges", 240], ["VAT 19%", 68.4]) } },
  { id: "d02", file: "d02-harbor-invoice.txt", type: "invoice", structure: "table", segment: "standard", category: "invoice", fields: {
    invoice_number: "HFL-5520", vendor_name: "Harbor Freight Logistics Ltd", document_date: "2024-05-02", due_date: "2024-05-16", payment_terms: "14",
    purchase_order: "PO-3310", tax_id: "GB123456789", currency: "GBP", total_amount: 1025.5, line_items: items(["Container handling", 850], ["Customs clearance", 175.5]) } },
  { id: "d03", file: "d03-cafe-receipt.txt", type: "receipt", structure: "table", segment: "standard", category: "receipt", fields: {
    ...absent, invoice_number: "R-88213", vendor_name: "Cafe Lindner", document_date: "2024-06-11", tax_id: "DE298765432", currency: "EUR", total_amount: 17.3,
    line_items: items(["Coffee", 7.8], ["Sandwich", 9.5]) } },
  { id: "d04", file: "d04-meridian-report.txt", type: "report", structure: "table", segment: "standard", category: "other", fields: {
    ...absent, vendor_name: "Meridian Facilities Services", document_date: "2024-04-05", currency: "USD", total_amount: 10750.5,
    line_items: items(["Cleaning", 3200], ["Security", 5400], ["Energy", 2150.5]) } },
  // Two workshops can fairly be one line or two.
  { id: "d05", file: "d05-elm-letter.txt", type: "invoice", structure: "narrative", segment: "standard", category: "invoice", acceptAmounts: [[1200, 1200, 340]], fields: {
    ...absent, invoice_number: "ES-204", vendor_name: "Elm Street Consulting", document_date: "2024-03-03", payment_terms: "30", currency: "EUR", total_amount: 2740,
    line_items: items(["Two workshops", 2400], ["Travel", 340]) } },
  { id: "d06", file: "d06-widgets-note.txt", type: "receipt", structure: "narrative", segment: "standard", category: "receipt", fields: {
    ...absent, document_date: "2024-02-14", currency: "GBP", total_amount: 500, line_items: items(["Fifty widgets", 500]) } },
  { id: "d07", file: "d07-bluepeak-report.txt", type: "report", structure: "narrative", segment: "standard", category: "other", fields: {
    ...absent, vendor_name: "Bluepeak Surveying", document_date: "2024-04-30", currency: "USD", total_amount: 1352.4,
    line_items: items(["Fuel", 312.4], ["Lodging", 890], ["Site permit", 150]) } },
  { id: "d08", file: "d08-alpine-invoice.txt", type: "invoice", structure: "mixed", segment: "international", category: "invoice", fields: {
    invoice_number: "AT-99017", vendor_name: "Alpine Tooling AG", document_date: "2024-07-19", due_date: null, payment_terms: "30", purchase_order: "4500123",
    tax_id: "CHE-123.456.789", currency: "CHF", total_amount: 1725, line_items: items(["Milling cutters", 1250], ["Regrinding service", 430], ["Shipping", 45]) } },
  { id: "d09", file: "d09-lumiere-invoice.txt", type: "invoice", structure: "mixed", segment: "international", category: "invoice", fields: {
    invoice_number: "FA-2024-311", vendor_name: "Societe Lumiere SARL", document_date: "2024-09-12", due_date: "2024-10-12", payment_terms: "30", purchase_order: null,
    tax_id: "FR40303265045", currency: "EUR", total_amount: 1841.4, line_items: items(["Eclairage LED", 1234.5], ["Installation", 300], ["TVA 20%", 306.9]) } },
  { id: "d10", file: "d10-greenline-invoice.txt", type: "invoice", structure: "mixed", segment: "standard", category: "invoice", fields: {
    invoice_number: "GP-7741", vendor_name: "Greenline Print Co.", document_date: "2024-01-22", due_date: "2024-02-21", payment_terms: "30", purchase_order: "PO-5502",
    tax_id: "12-3456789", currency: "USD", total_amount: 777.6, line_items: items(["Brochures", 600], ["Posters", 200], ["Loyalty discount", -80], ["Sales tax", 57.6]) } },
  { id: "d11", file: "d11-brightway-scan.txt", type: "invoice", structure: "mixed", segment: "scanned", category: "invoice", accept: { vendor_name: ["Br1ghtway Electr1cal Ltd"] }, fields: {
    ...absent, invoice_number: "3381", vendor_name: "Brightway Electrical Ltd", document_date: "2024-11-08", currency: "GBP", total_amount: 1545.5,
    line_items: items(["Rewiring", 1200], ["Parts", 345.5]) } },
  // The transcription gives "Feb 14" with no year, so any full date has an invented year.
  { id: "d12", file: "d12-joes-handwritten.txt", type: "receipt", structure: "mixed", segment: "handwritten", category: "receipt", fields: {
    ...absent, vendor_name: "Joe's Hardware", currency: "USD", total_amount: 19.5, line_items: items(["3 hinges", 13.5], ["1 box screws", 6]) } },
  { id: "d13", file: "d13-acme-minimal.txt", type: "invoice", structure: "mixed", segment: "standard", category: "invoice", fields: {
    ...absent, invoice_number: "1234", vendor_name: "Acme Corp", document_date: "2024-03-15", currency: "USD", total_amount: 500 } },
  { id: "d14", file: "d14-accounts-fragment.txt", type: "fragment", structure: "narrative", segment: "standard", category: "unclear", fields: { ...absent, total_amount: 120 } },
  // Monthly fee, no total: whether it is a line item is a judgement call, so neither is scored.
  { id: "d15", file: "d15-rhein-contract.txt", type: "contract", structure: "narrative", segment: "standard", category: "contract", unscored: ["line_items", "total_amount"], fields: {
    ...absent, vendor_name: "Rhein Cloud Hosting GmbH", document_date: "2024-02-01", payment_terms: "month", currency: "EUR" } },
  { id: "d16", file: "d16-castlegate-invoice.txt", type: "invoice", structure: "table", segment: "standard", category: "invoice", errors: [{ kind: "total_mismatch", sum: 335, stated: 355 }], fields: {
    invoice_number: "CP-1180", vendor_name: "Castlegate Plumbing Ltd", document_date: "2024-08-05", due_date: "2024-09-04", payment_terms: "30", purchase_order: "PO-8801",
    tax_id: "GB987654321", currency: "GBP", total_amount: 355, line_items: items(["Boiler service", 180], ["Valve replacement", 95], ["Call-out charge", 60]) } },
  { id: "d17", file: "d17-fenwick-invoice.txt", type: "invoice", structure: "mixed", segment: "standard", category: "invoice", errors: [{ kind: "date_order", document_date: "2024-06-20", due_date: "2024-05-20" }], fields: {
    invoice_number: "FL-2291", vendor_name: "Fenwick Legal LLP", document_date: "2024-06-20", due_date: "2024-05-20", payment_terms: "30", purchase_order: "PO-1207",
    tax_id: "GB444555666", currency: "GBP", total_amount: 1500, line_items: items(["Contract review fee", 1500]) } },
  { id: "d18", file: "d18-orion-invoice.txt", type: "invoice", structure: "table", segment: "standard", category: "invoice", fields: {
    invoice_number: "OL-20240912-7", vendor_name: "Orion Lab Supplies Inc.", document_date: "2024-09-12", due_date: "2024-10-12", payment_terms: "30", purchase_order: "PO-6620",
    tax_id: "98-7654321", currency: "USD", total_amount: 161, line_items: items(["Pipettes", 125], ["Gloves", 36]) } },
  { id: "d19", file: "d19-kestrel-report.txt", type: "report", structure: "mixed", segment: "standard", category: "other", fields: {
    ...absent, vendor_name: "Kestrel Aviation Consulting", currency: "EUR", total_amount: 3790, line_items: items(["Flights", 2310], ["Hotels", 1480]) } },
  { id: "d20", file: "d20-freshmart-receipt.txt", type: "receipt", structure: "table", segment: "standard", category: "receipt", fields: {
    ...absent, invoice_number: "00917", vendor_name: "FreshMart Store 221", document_date: "2024-09-30", tax_id: "GB555666777", currency: "GBP", total_amount: 56,
    line_items: items(["Groceries", 43.2], ["Household", 12.8]) } },
];

export const getDocument = (id) => {
  const doc = DOCUMENTS.find((d) => d.id === id);
  if (!doc) throw new Error(`Unknown document: ${id}`);
  return doc;
};

export const documentText = (doc) => readFileSync(resolve(DOCUMENTS_DIR, doc.file), "utf8").replace(/\r\n/g, "\n");

export const lineItemSum = (items) => Math.round(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100;

const isEmpty = (value) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
const squash = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

// Numbers written as strings still count as the right value. Whether the format is right is measured separately.
export function asNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const cleaned = value.replace(/[^0-9.,-]/g, "");
  if (/,\d{2}$/.test(cleaned)) return Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number(cleaned.replace(/,/g, ""));
}

function sameAmounts(expected, actual) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const sorted = (list) => list.map((n) => Math.round(n * 100)).sort((a, b) => a - b);
  return sorted(expected.map((i) => i.amount)).join() === sorted(actual.map((i) => asNumber(i?.amount))).join();
}

function sameValue(field, expected, actual, doc) {
  if (field === "line_items") {
    return sameAmounts(expected, actual) || (doc.acceptAmounts ?? []).some((amounts) => sameAmounts(amounts.map((amount) => ({ amount })), actual));
  }
  if (field === "total_amount") return Math.abs(asNumber(actual) - expected) < 0.01;
  if (field === "document_date" || field === "due_date") return String(actual).slice(0, 10) === expected;
  if (field === "payment_terms") return squash(actual).includes(squash(expected));
  if (field === "currency") {
    const symbols = { EUR: "€", GBP: "£", USD: "$" };
    return String(actual).toUpperCase() === expected || actual === symbols[expected];
  }
  const a = squash(actual);
  return [expected, ...(doc.accept?.[field] ?? [])].some((candidate) => {
    const e = squash(candidate);
    return a === e || (a.length >= 3 && (a.includes(e) || e.includes(a)));
  });
}

// Every field gets one of: correct, correct_null, wrong, empty (exists, not extracted),
// fabricated (absent, value invented). Pass `fields` to score a subset.
export function scoreExtraction(doc, output, fields = Object.keys(doc.fields)) {
  const outcomes = {};
  for (const field of fields) {
    if (doc.unscored?.includes(field)) continue;
    const expected = doc.fields[field];
    const actual = output?.[field];
    if (isEmpty(expected)) outcomes[field] = isEmpty(actual) ? "correct_null" : "fabricated";
    else if (isEmpty(actual)) outcomes[field] = "empty";
    else outcomes[field] = sameValue(field, expected, actual, doc) ? "correct" : "wrong";
  }
  return outcomes;
}

// Counts over a list of outcome maps, with the denominators the rates need.
export function tallyOutcomes(outcomeMaps) {
  const tally = { fields: 0, correct: 0, correct_null: 0, wrong: 0, empty: 0, fabricated: 0, present: 0, absent: 0 };
  for (const outcomes of outcomeMaps) {
    for (const outcome of Object.values(outcomes)) {
      tally.fields++;
      tally[outcome]++;
      if (outcome === "correct" || outcome === "wrong" || outcome === "empty") tally.present++;
      else tally.absent++;
    }
  }
  return tally;
}

// Checks that the key agrees with itself and with the files. Returns problems, empty when consistent.
export function fixtureProblems() {
  const problems = [];
  for (const doc of DOCUMENTS) {
    const { total_amount: total, line_items: lines } = doc.fields;
    const mismatch = doc.errors?.find((e) => e.kind === "total_mismatch");
    if (mismatch) {
      if (lineItemSum(lines) !== mismatch.sum || total !== mismatch.stated) problems.push(`${doc.id}: recorded mismatch is wrong`);
    } else if (lines.length && lineItemSum(lines) !== total) {
      problems.push(`${doc.id}: line items sum to ${lineItemSum(lines)}, total is ${total}`);
    }
    if (documentText(doc).trim().length === 0) problems.push(`${doc.id}: empty document`);
  }
  return problems;
}
