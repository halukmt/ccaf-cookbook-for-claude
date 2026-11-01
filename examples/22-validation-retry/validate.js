// Semantic validation. Pure functions, no model. Each error states what was expected and what was
// found, and whether another attempt could possibly fix it, judged by looking at the source text.

import { CATEGORIES } from "./extraction.js";

const money = (n) => Math.round(n * 100) / 100;

// Where a value would be labelled in a document. No label means the information is not there.
const SOURCE_LABELS = {
  due_date: /\bdue\b|payable by|payment due|[eé]ch[eé]ance/i,
  tax_id: /\bvat\b|tax id|ust-?id|\btva\b|mwst|\bein\b/i,
  vendor_name: /\w/,
  invoice_number: /invoice|receipt|facture|rechnung|doc no|ref/i,
  invoice_date: /\d{4}|\bdate\b/i,
};
export const REQUIRED_FOR_PAYMENT = ["vendor_name", "invoice_number", "invoice_date", "due_date", "tax_id"];

// Every number in the text, read as a value, in the formats these documents use.
export function numbersIn(text) {
  const found = new Set();
  for (const raw of text.match(/-?\d[\d.,']*\d|\d/g) ?? []) {
    let value;
    if (/,\d{2}$/.test(raw)) value = Number(raw.replace(/[.']/g, "").replace(",", "."));
    else value = Number(raw.replace(/[,']/g, ""));
    if (!Number.isNaN(value)) found.add(money(Math.abs(value)));
  }
  return found;
}
const amountInSource = (amount, numbers) => numbers.has(money(Math.abs(amount)));

const err = (code, field, message, fixable, advisory = false) => ({ code, field, message, fixable, advisory });

// The model's own arithmetic and flags are compared with the code's, and reported. They do not block a
// document or trigger a retry: a real run repeated a wrong sum through three retries with the right
// answer in the feedback. applyCodeFigures() puts the correct values in place.
export function applyCodeFigures(result) {
  const sum = money((result.line_items ?? []).reduce((total, item) => total + (Number(item.amount) || 0), 0));
  const stated = result.stated_total;
  return { ...result, calculated_total: sum, total_discrepancy: stated !== null && stated !== undefined && Math.abs(sum - stated) > 0.01 };
}

// `retried` says this extraction already received feedback. Only then is a self-reported source
// conflict believed: the first time, a misread could look exactly the same.
export function validateExtraction(result, sourceText, { retried = false } = {}) {
  const errors = [];
  const numbers = numbersIn(sourceText);

  // 1. Field completeness, and values with no basis in the source.
  for (const field of REQUIRED_FOR_PAYMENT) {
    const value = result[field];
    const labelled = SOURCE_LABELS[field].test(sourceText);
    if (value === null || value === undefined || value === "") {
      errors.push(labelled
        ? err("missing", field, `${field} is null, but the document appears to contain it. Expected a value from the document.`, true)
        : err("not_in_source", field, `${field} is null and was not found in source. A person must supply it.`, false));
    } else if (!labelled) {
      errors.push(err("unsupported_value", field, `${field} is "${value}", but the document has nothing that could state it. Expected null.`, true));
    }
  }

  // 2. Numerical consistency.
  const items = Array.isArray(result.line_items) ? result.line_items : [];
  const sum = money(items.reduce((total, item) => total + (Number(item.amount) || 0), 0));
  if (result.stated_total === null || result.stated_total === undefined) {
    errors.push(err("missing", "stated_total", "stated_total is null. Expected the total printed in the document.", numbers.size > 0));
  }
  if (items.length === 0) {
    const decimals = (sourceText.match(/\d[.,]\d{2}\b/g) ?? []).length;
    errors.push(decimals >= 2
      ? err("missing", "line_items", `line_items is empty, but the document has ${decimals} amounts. Expected its charges.`, true)
      : err("not_in_source", "line_items", "line_items is empty and no itemisation was found in source. A person must supply it.", false));
  } else {
    if (result.stated_total !== null && result.stated_total !== undefined && Math.abs(sum - result.stated_total) > 0.01) {
      const believed = retried && result.conflict_detected === true;
      errors.push(believed
        ? err("source_conflict", "stated_total", `Line items sum to ${sum} but stated_total is ${result.stated_total}, and the document's own figures disagree. A person must decide.`, false)
        : err("sum_mismatch", "line_items", `Line items sum to ${sum} but stated_total is ${result.stated_total}. Re-read the charges. If the document's own figures truly disagree, keep them as printed and set conflict_detected to true.`, true));
    }
    if (Math.abs(sum - result.calculated_total) > 0.01) {
      errors.push(err("calculated_total_wrong", "calculated_total", `calculated_total is ${result.calculated_total}, but the line items sum to ${sum}.`, false, true));
    }
    for (const item of items) {
      if (!amountInSource(item.amount, numbers) && !/quantity/.test(item.detected_pattern ?? "")) {
        errors.push(err("invented_amount", "line_items", `Line item "${item.description}" has amount ${item.amount}, which does not appear in the document. Expected only printed charges.`, true));
      }
    }
    const actual = result.stated_total !== null && result.stated_total !== undefined && Math.abs(sum - result.stated_total) > 0.01;
    if (result.total_discrepancy !== actual) {
      errors.push(err("flag_wrong", "total_discrepancy", `total_discrepancy is ${result.total_discrepancy}, expected ${actual}.`, false, true));
    }
  }

  // 3. Enum validity.
  if (!CATEGORIES.includes(result.category)) {
    errors.push(err("bad_enum", "category", `category is "${result.category}", expected one of ${CATEGORIES.join(", ")}.`, true));
  }

  // 4. Date order. If both dates are printed exactly so, no extraction can change that.
  if (result.invoice_date && result.due_date && result.due_date < result.invoice_date) {
    const printed = sourceText.includes(result.invoice_date) && sourceText.includes(result.due_date);
    errors.push(printed
      ? err("source_conflict", "due_date", `due_date ${result.due_date} is before invoice_date ${result.invoice_date}, and the document prints both. A person must decide.`, false)
      : err("date_order", "due_date", `due_date ${result.due_date} is before invoice_date ${result.invoice_date}. Expected due after invoice. Re-read both dates.`, true));
  }

  return errors;
}

export function buildRetryMessage(sourceText, failed, errors) {
  return `Original document:\n${sourceText}\n\n` +
    `Your extraction:\n${JSON.stringify(failed, null, 2)}\n\n` +
    `Validation errors:\n${errors.map((e) => `- ${e.message}`).join("\n")}\n\n` +
    "Re-extract the document, fixing these errors. Report only what the document states. Do not add a value or a line item to make the numbers agree.";
}
