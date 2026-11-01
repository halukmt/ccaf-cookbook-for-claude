// Tool schemas and the call that applies them. All outputs are scored against
// _fixtures/documents-answers.js and checked against the schema with validateInput().

import { client, FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { documentText, getDocument } from "../../_fixtures/documents-answers.js";

export const CATEGORIES = ["invoice", "receipt", "contract", "unclear", "other"];
export const SCORED_FIELDS = ["invoice_number", "vendor_name", "document_date", "payment_terms", "purchase_order", "tax_id"];
export const OPTIONAL_FIELDS = ["payment_terms", "purchase_order", "tax_id"];

const properties = {
  invoice_number: { type: "string", description: "Invoice, receipt or document number as printed" },
  vendor_name: { type: "string", description: "Company or person issuing the document" },
  document_date: { type: "string", description: "Date, in ISO 8601 format" },
  payment_terms: { type: ["string", "null"], description: "Payment terms if stated, otherwise null" },
  purchase_order: { type: ["string", "null"], description: "Purchase order number if stated, otherwise null" },
  tax_id: { type: ["string", "null"], description: "VAT number or tax ID if stated, otherwise null" },
  category: { type: "string", enum: CATEGORIES },
  category_detail: { type: ["string", "null"], description: "What the document is, only when category is 'other'" },
};

// Step 1: three required fields, three that may be null, a category list that includes unclear and
// other, and a detail field for other.
export const extractTool = {
  name: "extract_document",
  description: "Record the structured data found in a document",
  input_schema: { type: "object", properties, required: ["invoice_number", "vendor_name", "document_date"] },
};

// The comparison arm for step 5: everything is required and nothing may be null.
export const allRequiredTool = {
  name: "extract_document",
  description: "Record the structured data found in a document",
  input_schema: {
    type: "object",
    properties: {
      ...properties,
      payment_terms: { type: "string", description: "Payment terms" },
      purchase_order: { type: "string", description: "Purchase order number" },
      tax_id: { type: "string", description: "VAT number or tax ID" },
    },
    required: [...SCORED_FIELDS, "category"],
  },
};

// Step 3: several tools, so "any" has a real choice to make.
const kindTool = (kind) => ({
  name: `extract_${kind}`,
  description: `Extract structured data from a ${kind}`,
  input_schema: extractTool.input_schema,
});
export const kindTools = ["invoice", "receipt", "contract"].map(kindTool);

// Step 4: a mandatory first step, with a more tempting alternative beside it.
export const extractMetadataTool = {
  name: "extract_metadata",
  description: "Record only the document's kind and date, before any other processing",
  input_schema: {
    type: "object",
    properties: { category: { type: "string", enum: CATEGORIES }, document_date: { type: ["string", "null"] } },
    required: ["category", "document_date"],
  },
};
export const extractDetailTool = {
  name: "extract_detail",
  description: "Extract all line items, totals and parties from a detailed invoice with line items",
  input_schema: {
    type: "object",
    properties: { vendor_name: { type: "string" }, total: { type: "number" }, items: { type: "array", items: { type: "string" } } },
    required: ["vendor_name", "total", "items"],
  },
};

// Strict mode: every property listed as required and additionalProperties false. "May be absent" is
// expressed with a nullable type, because the shape itself may not vary.
const nullable = (spec) => ({ ...spec, type: Array.isArray(spec.type) ? spec.type : [spec.type, "null"] });
export const strictSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    invoice_number: nullable(properties.invoice_number),
    vendor_name: nullable(properties.vendor_name),
    document_date: nullable(properties.document_date),
    payment_terms: properties.payment_terms,
    purchase_order: properties.purchase_order,
    tax_id: properties.tax_id,
    category: properties.category,
    category_detail: properties.category_detail,
  },
  required: [...SCORED_FIELDS, "category", "category_detail"],
};
export const strictTool = { name: "extract_document", description: extractTool.description, strict: true, input_schema: strictSchema };
export const JSON_FORMAT = { type: "json_schema", schema: strictSchema };

export const USE_TOOL = "Use the extract_document tool to record this document. Use null for anything the document does not state.";
export const USE_FORMAT = "Extract this document's data. Use null for anything the document does not state.";

// One request. Returns what was asked for and what came back, with the shape of the answer.
export async function callModel({ docId, tools, toolChoice, model = FORCED_TOOL_MODEL, system, outputConfig, maxTokens = 2000 }) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(outputConfig ? { output_config: outputConfig } : {}),
    messages: [{ role: "user", content: documentText(getDocument(docId)) }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    docId,
    model,
    stopReason: response.stop_reason,
    blockTypes: response.content.map((b) => b.type),
    toolName: toolUse?.name ?? null,
    toolNames: response.content.filter((b) => b.type === "tool_use").map((b) => b.name),
    input: toolUse?.input ?? null,
    text,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

export async function callEach(docIds, options) {
  const rows = [];
  for (const docId of docIds) rows.push(await callModel({ docId, ...options }));
  return rows;
}

// A small check of the JSON Schema features used here. Returns a list of problems.
export function validateInput(schema, input) {
  const problems = [];
  if (input === null || typeof input !== "object") return ["input is not an object"];
  for (const key of schema.required ?? []) if (!(key in input)) problems.push(`missing ${key}`);
  for (const [key, value] of Object.entries(input)) {
    const spec = schema.properties[key];
    if (!spec) {
      if (schema.additionalProperties === false) problems.push(`extra property ${key}`);
      continue;
    }
    const types = [spec.type].flat();
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(actual)) problems.push(`${key} is ${actual}`);
    if (spec.enum && value !== null && !spec.enum.includes(value)) problems.push(`${key} has value ${value}`);
  }
  return problems;
}

export function sumUsage(rows) {
  return rows.reduce(
    (total, row) => ({ input_tokens: total.input_tokens + row.usage.input_tokens, output_tokens: total.output_tokens + row.usage.output_tokens }),
    { input_tokens: 0, output_tokens: 0 }
  );
}
