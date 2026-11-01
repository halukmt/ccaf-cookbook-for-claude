// Steps 1 and 2: the tool schema and the validator, checked without a model.

import { check, finishChecks } from "../../_shared/check.js";
import { documentText, getDocument } from "../../_fixtures/documents-answers.js";
import { extractionTool } from "./extraction.js";
import { applyCodeFigures, numbersIn, validateExtraction } from "./validate.js";

const props = extractionTool.input_schema.properties;
check("Step 1: separate calculated_total and stated_total", props.calculated_total.type === "number" && props.stated_total.type.includes("number"));
check("Step 1: total_discrepancy and conflict_detected are booleans", props.total_discrepancy.type === "boolean" && props.conflict_detected.type === "boolean");
check("Step 1: detected_pattern on each line item", Boolean(props.line_items.items.properties.detected_pattern));

const text = documentText(getDocument("d01"));
const good = {
  vendor_name: "Northwind", invoice_number: "INV-2024-1041", invoice_date: "2024-03-15", due_date: "2024-04-14", tax_id: "DE811907980", category: "invoice",
  line_items: [{ description: "Copy paper", amount: 120, detected_pattern: "table_row" }, { description: "Toner", amount: 240, detected_pattern: "table_row" }, { description: "VAT", amount: 68.4, detected_pattern: "tax_line" }],
  calculated_total: 428.4, stated_total: 428.4, total_discrepancy: false, conflict_detected: false,
};
const codes = (result, source = text, options) => validateExtraction(result, source, options).map((e) => e.code);

check("A correct extraction has no errors", codes(good).length === 0, codes(good).join(", "));

const wrongSum = { ...good, stated_total: 500 };
const sumErrors = validateExtraction(wrongSum, text);
console.log("Example error:", sumErrors[0].message);
check("Sum: the message states both values", sumErrors[0].message.includes("428.4") && sumErrors[0].message.includes("500"));
check("Sum: the flag is checked as well", codes(wrongSum).includes("flag_wrong"));
check("Sum: calculated_total is checked against the items", codes({ ...good, calculated_total: 1 }).includes("calculated_total_wrong"));
check("Wrong model arithmetic is advisory and triggers no retry", validateExtraction({ ...good, calculated_total: 1 }, text).every((e) => e.advisory && !e.fixable));
check("The code replaces the model figures", applyCodeFigures({ ...good, calculated_total: 1, total_discrepancy: true }).calculated_total === 428.4 && applyCodeFigures({ ...good, total_discrepancy: true }).total_discrepancy === false);
check("Enum: a bad category is caught", codes({ ...good, category: "memo" }).includes("bad_enum"));
check("Dates: due before invoice is caught", codes({ ...good, due_date: "2024-01-01" }).includes("date_order"));
check("Completeness: a null with a label in the source is fixable", validateExtraction({ ...good, tax_id: null }, text).find((e) => e.field === "tax_id").fixable === true);

const bare = documentText(getDocument("d13"));
const d13 = { ...good, tax_id: null, due_date: null, line_items: [], stated_total: 500, invoice_number: "1234" };
const d13Errors = validateExtraction(d13, bare);
check("Completeness: a null with no label in the source is not fixable", d13Errors.find((e) => e.field === "tax_id").fixable === false);
check("Completeness: no items and no amounts is not fixable", d13Errors.find((e) => e.field === "line_items").fixable === false);
check("A value with no basis is caught", codes({ ...d13, tax_id: "DE123" }, bare).includes("unsupported_value"));

check("An amount that is not in the document is caught", codes({ ...good, line_items: [...good.line_items, { description: "Unexplained", amount: 20, detected_pattern: "other" }] }).includes("invented_amount"));
check("Numbers are read in several formats", ["1'250.00", "1.234,50", "1,025.50"].every((raw) => [...numbersIn(raw)].some((n) => [1250, 1234.5, 1025.5].includes(n))));

const d16 = documentText(getDocument("d16"));
const printedConflict = { ...good, invoice_number: "CP-1180", invoice_date: "2024-08-05", due_date: "2024-09-04", tax_id: "GB987654321", line_items: [{ description: "Boiler", amount: 180, detected_pattern: "table_row" }, { description: "Valve", amount: 95, detected_pattern: "table_row" }, { description: "Call-out", amount: 60, detected_pattern: "table_row" }], calculated_total: 335, stated_total: 355, total_discrepancy: true, conflict_detected: true };
check("A self-reported conflict is not believed on the first pass", codes(printedConflict, d16).includes("sum_mismatch"));
check("It is believed after a retry, and goes to a person", validateExtraction(printedConflict, d16, { retried: true }).find((e) => e.code === "source_conflict")?.fixable === false);

const d17 = documentText(getDocument("d17"));
check("Dates printed in the wrong order are not fixable", validateExtraction({ ...good, invoice_number: "FL-2291", invoice_date: "2024-06-20", due_date: "2024-05-20", tax_id: "GB444555666", line_items: [{ description: "Fee", amount: 1500, detected_pattern: "table_row" }], calculated_total: 1500, stated_total: 1500 }, d17).find((e) => e.field === "due_date")?.fixable === false);

finishChecks();
