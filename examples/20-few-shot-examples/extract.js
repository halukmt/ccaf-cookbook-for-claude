// The extraction prompt with and without few-shot examples, and pure measurements against the answer
// key in _fixtures/documents-answers.js. Plain JSON text, not a tool, because malformed output is one
// of the things being measured.

import { client, FAST_MODEL } from "../../_shared/client.js";
import { documentText, getDocument, scoreExtraction, tallyOutcomes } from "../../_fixtures/documents-answers.js";

// 3 tables, 3 narratives and 4 mixed.
export const TEST_IDS = ["d01", "d02", "d03", "d05", "d06", "d07", "d08", "d10", "d11", "d12"];
export const TEST_DOCS = TEST_IDS.map(getDocument);
export const FIELDS = ["vendor_name", "document_date", "total_amount", "line_items"];
export const STRUCTURES = ["table", "narrative", "mixed"];

// Thorough on purpose, and it deliberately demands a value for every field.
export const BASE_PROMPT = `Pull these fields out of the document:
- vendor_name: Who issued the document, a company or a person. Look in the header, the signature or the opening sentence.
- document_date: Date of the document in ISO 8601 format (YYYY-MM-DD). It may be written in words or in another format.
- total_amount: Numeric value without currency symbols or thousands separators, using a dot for decimals. Use the final amount payable. It may be written in words.
- line_items: Array of {description, amount} objects, with amount numeric. List every charge that adds up to the total, including tax, shipping and discounts as a negative amount. A subtotal is not a line item. Items may be in a table or in sentences.

Reply in JSON. Every field must have a value.`;

// Written after reading the baseline failures: see notes.md. None of these documents is in the test set.
export const FEW_SHOT_EXAMPLES = [
  {
    structure: "narrative",
    input: "We ordered eight chairs at forty pounds each on the ninth of May 2023, and delivery was another twenty pounds. Paid at the counter.",
    output: { vendor_name: null, document_date: "2023-05-09", total_amount: 340, line_items: [{ description: "Eight chairs", amount: 320 }, { description: "Delivery", amount: 20 }] },
    reasoning: "The date is in words and the year is given, so it becomes ISO 8601. The chair amount is quantity times unit price. No total is stated, so it is the sum of the two charges. Nothing names a seller, so vendor_name is null. A guess would look like data.",
  },
  {
    structure: "table",
    input: "Tally Signs Ltd\nInvoice 88, 4 June 2023\n\n| Item | GBP |\n| Banner | 300.00 |\n| Subtotal | 300.00 |\n| Discount 5% | -15.00 |\n| Fitting | 25.00 |\n| Due | 310.00 |",
    output: { vendor_name: "Tally Signs Ltd", document_date: "2023-06-04", total_amount: 310, line_items: [{ description: "Banner", amount: 300 }, { description: "Discount 5%", amount: -15 }, { description: "Fitting", amount: 25 }] },
    reasoning: "The subtotal repeats the banner, so it is left out. The discount is a negative amount. Check: 300 - 15 + 25 = 310, which equals the stated total.",
  },
  {
    structure: "mixed",
    input: "[handwritten note, transcribed]\nM. Ruiz Plumbing\nfixed tap 45 / washer 3\ntot 48, Mar 2",
    output: { vendor_name: "M. Ruiz Plumbing", document_date: null, total_amount: 48, line_items: [{ description: "Fixed tap", amount: 45 }, { description: "Washer", amount: 3 }] },
    reasoning: "The note gives a month and a day but no year. A full ISO 8601 date would need an invented year, so document_date is null. Amounts are plain numbers, with no currency symbol added.",
  },
];

export function fewShotPrompt(examples = FEW_SHOT_EXAMPLES) {
  const blocks = examples.map((ex, i) =>
    `<example number="${i + 1}">\n<document>\n${ex.input}\n</document>\n<extraction>\n${JSON.stringify(ex.output)}\n</extraction>\n<reasoning>\n${ex.reasoning}\n</reasoning>\n</example>`
  );
  return `${BASE_PROMPT}\n\nExamples, with the reasoning behind each decision:\n\n${blocks.join("\n\n")}`;
}

// Records the raw answer. A reply that needs repair is a format failure, even when the data is right.
export function parseAnswer(text) {
  const trimmed = text.trim();
  try {
    return { output: JSON.parse(trimmed), bare: true };
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
    try {
      return { output: JSON.parse(candidate), bare: false };
    } catch {
      return { output: null, bare: false };
    }
  }
}

export async function extractDocument(systemPrompt, doc, { model = FAST_MODEL, maxTokens = 2000 } = {}) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: documentText(doc) }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    id: doc.id,
    text,
    stopReason: response.stop_reason,
    ...parseAnswer(text),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

export async function runAll(systemPrompt, docs, runs) {
  const out = [];
  for (let run = 0; run < runs; run++) {
    console.log(`Run ${run + 1} of ${runs}`);
    const rows = [];
    for (const doc of docs) rows.push(await extractDocument(systemPrompt, doc));
    out.push(rows);
  }
  return out;
}

// One answer is well formed when it parsed bare and each field has the promised shape.
export function formatProblems(row) {
  const problems = [];
  if (!row.output) return ["not JSON"];
  if (!row.bare) problems.push("wrapped in text or a fence");
  const { document_date: date, total_amount: total, line_items: lines } = row.output;
  if (date !== null && date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) problems.push(`date format: ${date}`);
  if (total !== null && total !== undefined && typeof total !== "number") problems.push(`total is ${typeof total}`);
  if (!Array.isArray(lines)) problems.push("line_items is not an array");
  else if (lines.some((l) => typeof l?.description !== "string" || typeof l?.amount !== "number")) problems.push("line item shape");
  const extra = Object.keys(row.output).filter((k) => !FIELDS.includes(k));
  if (extra.length) problems.push(`extra fields: ${extra.join(", ")}`);
  return problems;
}

const fingerprint = (output) => {
  if (!output) return "none";
  const lines = Array.isArray(output.line_items) ? output.line_items.map((l) => l?.amount).sort() : output.line_items;
  return JSON.stringify([output.vendor_name, output.document_date, output.total_amount, lines]);
};

// All measures for a set of runs. Rates carry their denominators.
export function measure(runs, docs = TEST_DOCS) {
  const rows = runs.flat().filter((row) => docs.some((d) => d.id === row.id));
  const outcomes = rows.map((row) => ({ id: row.id, outcomes: scoreExtraction(docs.find((d) => d.id === row.id), row.output, FIELDS) }));
  const tally = tallyOutcomes(outcomes.map((o) => o.outcomes));
  const wellFormed = rows.filter((row) => formatProblems(row).length === 0).length;
  const stable = docs.filter((doc) => new Set(runs.map((rs) => fingerprint(rs.find((r) => r.id === doc.id)?.output))).size === 1).length;
  return {
    tally,
    answers: rows.length,
    accuracy: (tally.correct + tally.correct_null) / tally.fields,
    emptyRate: tally.present ? tally.empty / tally.present : 0,
    fabricationRate: tally.absent ? tally.fabricated / tally.absent : 0,
    formatRate: rows.length ? wellFormed / rows.length : 0,
    wellFormed,
    stableDocs: stable,
    docs: docs.length,
  };
}

// Field by structure: how often each outcome occurred, to show patterns and not single failures.
export function failureLog(runs, docs = TEST_DOCS) {
  const log = [];
  for (const structure of STRUCTURES) {
    const inType = docs.filter((d) => d.structure === structure);
    const line = { structure };
    for (const field of FIELDS) {
      const counts = {};
      for (const doc of inType) {
        for (const rows of runs) {
          const outcome = scoreExtraction(doc, rows.find((r) => r.id === doc.id).output, [field])[field];
          counts[outcome] = (counts[outcome] ?? 0) + 1;
        }
      }
      line[field] = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ");
    }
    log.push(line);
  }
  return log;
}

export function failures(runs, docs = TEST_DOCS) {
  const out = [];
  runs.forEach((rows, run) => {
    for (const row of rows) {
      const doc = docs.find((d) => d.id === row.id);
      const outcomes = scoreExtraction(doc, row.output, FIELDS);
      for (const [field, outcome] of Object.entries(outcomes)) {
        if (!["correct", "correct_null"].includes(outcome)) {
          const got = row.output?.[field];
          out.push({ run: run + 1, doc: doc.id, structure: doc.structure, field, outcome, got: JSON.stringify(field === "line_items" && Array.isArray(got) ? got.map((l) => l?.amount) : got) });
        }
      }
      const format = formatProblems(row);
      if (format.length) out.push({ run: run + 1, doc: doc.id, structure: doc.structure, field: "format", outcome: "format", got: format.join("; ") });
    }
  });
  return out;
}

export function sumUsage(runs) {
  return runs.flat().reduce(
    (total, row) => ({ input_tokens: total.input_tokens + row.usage.input_tokens, output_tokens: total.output_tokens + row.usage.output_tokens }),
    { input_tokens: 0, output_tokens: 0 }
  );
}

export const pct = (value) => `${(value * 100).toFixed(0)}%`;
