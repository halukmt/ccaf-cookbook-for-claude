// The self-checking extraction tool and the call that uses it.

import { client, FORCED_TOOL_MODEL } from "../../_shared/client.js";

export const CATEGORIES = ["invoice", "receipt", "report", "contract", "unclear"];
export const PATTERNS = ["table_row", "prose_sentence", "quantity_times_price", "discount", "tax_line", "shipping_or_fee", "ocr_text", "other"];

// Two layers: the data as extracted, and the model's own assessment of that data.
export const extractionTool = {
  name: "extract_invoice",
  description: "Record the data of one financial document, and whether its numbers agree. Use null for anything the document does not state.",
  input_schema: {
    type: "object",
    properties: {
      vendor_name: { type: ["string", "null"] },
      invoice_number: { type: ["string", "null"] },
      invoice_date: { type: ["string", "null"], description: "ISO 8601" },
      due_date: { type: ["string", "null"], description: "ISO 8601" },
      tax_id: { type: ["string", "null"], description: "VAT number or tax ID, as printed" },
      category: { type: "string", enum: CATEGORIES },
      line_items: {
        type: "array",
        description: "Every charge that makes up the total, including tax, shipping and discounts (negative). Not subtotals.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            amount: { type: "number" },
            detected_pattern: { type: "string", enum: PATTERNS, description: "The document feature this item was read from" },
          },
          required: ["description", "amount", "detected_pattern"],
        },
      },
      calculated_total: { type: "number", description: "The sum of line_items amounts, worked out by you" },
      stated_total: { type: ["number", "null"], description: "The total printed in the document" },
      total_discrepancy: { type: "boolean", description: "True when calculated_total differs from stated_total" },
      conflict_detected: { type: "boolean", description: "True when the document's own figures do not agree with each other" },
    },
    required: ["vendor_name", "invoice_number", "invoice_date", "due_date", "tax_id", "category", "line_items", "calculated_total", "stated_total", "total_discrepancy", "conflict_detected"],
  },
};

const FORCED = { type: "tool", name: "extract_invoice", disable_parallel_tool_use: true };

export async function extract(content, { model = FORCED_TOOL_MODEL, maxTokens = 3000 } = {}) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    tools: [extractionTool],
    tool_choice: FORCED,
    messages: [{ role: "user", content }],
  });
  const block = response.content.find((b) => b.type === "tool_use");
  if (!block) throw new Error(`No tool call, stop_reason ${response.stop_reason}`);
  return {
    result: block.input,
    stopReason: response.stop_reason,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

export const sumOf = (usages) =>
  usages.reduce((t, u) => ({ input_tokens: t.input_tokens + u.input_tokens, output_tokens: t.output_tokens + u.output_tokens }), { input_tokens: 0, output_tokens: 0 });
