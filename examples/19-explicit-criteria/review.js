// The review prompts, the call that applies one to a snippet, and pure scoring against the labels in
// _fixtures/review-snippets.js. Everything is measured, nothing is estimated.

import { client, FAST_MODEL } from "../../_shared/client.js";

// Step 1: a one-line instruction with nothing concrete in it.
export const VAGUE_PROMPT = "Review the code below and stay conservative: report a finding only when you are highly confident in it.";

// Step 2: what to report, what to skip, and the comment rule.
export const CRITERIA_PROMPT = `Review this code against these criteria.

Report:
- Security vulnerabilities: untrusted input reaching a query or a command, secrets or card data written to logs.
- Bugs and logic errors: code that crashes or gives a wrong result for an input it can really receive.
- A comment only when the behaviour it claims contradicts what the code actually does.

Skip, and return no finding for:
- Minor style preferences, formatting choices and local naming patterns.
- Unused variables and unused imports, unless one shadows something that is used.
- Comments that are informal, historical or a TODO, as long as they do not contradict the code.
- Correct code that merely looks suspicious. Name the input that breaks it, or do not report it.

If nothing meets the criteria, return an empty list of findings.`;

// Step 3: the same criteria plus code patterns per severity level.
export const SEVERITY_EXAMPLES = `

Severity is set by matching these patterns, not by how serious the issue sounds.

critical, unsanitised user input in a SQL query:
  query = f"SELECT * FROM orders WHERE customer = {user_input}"

critical, card data written to a log:
  console.log("Charging", card.number, card.cvc);

major, missing null check before property access on data that can be null:
  const name = response.data.user.name; // data is null for an unknown user

major, comment contradicting the code:
  // Returns newest first
  return rows.sort((a, b) => a.date - b.date);

minor, a real defect with little effect, such as a wrong message in a log line:
  logger.info("Saved 2 files", files.length);`;

export const EXPLICIT_PROMPT = CRITERIA_PROMPT + SEVERITY_EXAMPLES;

export const CATEGORIES = ["security", "logic", "documentation_mismatch", "style", "unused_code", "other"];

// Structured output, so scoring reads fields and not prose. Same format for every prompt, so a
// difference in results comes from the instructions.
const FINDINGS_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "category", "description"],
          properties: {
            severity: { type: "string", enum: ["critical", "major", "minor"] },
            category: { type: "string", enum: CATEGORIES },
            description: { type: "string" },
          },
        },
      },
    },
  },
};

export async function classify(systemPrompt, code, { model = FAST_MODEL, maxTokens = 2000 } = {}) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    output_config: { format: FINDINGS_FORMAT },
    messages: [{ role: "user", content: code }],
  });
  if (response.stop_reason !== "end_turn") throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    findings: JSON.parse(text).findings,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

export async function runPrompt(systemPrompt, snippets, options) {
  const rows = [];
  for (const snippet of snippets) {
    const { findings, usage } = await classify(systemPrompt, snippet.code, options);
    rows.push({ id: snippet.id, findings, usage });
  }
  return rows;
}

const RANK = { critical: 3, major: 2, minor: 1 };
export const topSeverity = (findings) =>
  findings.reduce((top, f) => (RANK[f.severity] > (RANK[top] ?? 0) ? f.severity : top), "none");

// A finding counts for a reportable snippet when its category fits. On a documentation snippet both
// documentation_mismatch and logic fit, since a wrong comment and wrong code are the same contradiction.
const fits = (snippet, finding) =>
  finding.category === snippet.category || (snippet.category === "documentation_mismatch" && finding.category === "logic");

// Decisions are per snippet per run: was it flagged, and is that right?
export function scoreRun(rows, snippets) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, inflatedFp: 0, severityRight: 0, extra: 0 };
  for (const row of rows) {
    const snippet = snippets.find((s) => s.id === row.id);
    if (snippet.report) {
      if (row.findings.some((f) => fits(snippet, f))) counts.tp++;
      else counts.fn++;
      if (topSeverity(row.findings) === snippet.severity) counts.severityRight++;
      counts.extra += row.findings.filter((f) => !fits(snippet, f)).length;
    } else if (row.findings.length > 0) {
      counts.fp++;
      if (["critical", "major"].includes(topSeverity(row.findings))) counts.inflatedFp++;
    } else {
      counts.tn++;
    }
  }
  return counts;
}

export function rates(counts) {
  const skip = counts.fp + counts.tn;
  const report = counts.tp + counts.fn;
  return {
    falsePositiveRate: skip ? counts.fp / skip : 0,
    falsePositiveSample: skip,
    recall: report ? counts.tp / report : 0,
    recallSample: report,
    precision: counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : 0,
    severityAccuracy: report ? counts.severityRight / report : 0,
  };
}

// A snippet is inconsistent when its label (highest severity, or none) differs between runs.
export function inconsistency(runs, snippets) {
  const unstable = snippets.filter((s) => {
    const labels = runs.map((rows) => topSeverity(rows.find((r) => r.id === s.id).findings));
    return new Set(labels).size > 1;
  });
  return { rate: unstable.length / snippets.length, sample: snippets.length, unstable: unstable.map((s) => s.id) };
}

// All runs of one prompt over a set of snippets, with the rates.
export function summarise(runs, snippets) {
  const subset = runs.map((rows) => rows.filter((r) => snippets.some((s) => s.id === r.id)));
  const counts = {};
  for (const rows of subset) {
    for (const [key, value] of Object.entries(scoreRun(rows, snippets))) counts[key] = (counts[key] ?? 0) + value;
  }
  return { counts, ...rates(counts), inconsistency: inconsistency(subset, snippets) };
}

// Per reported category: what share of the findings the model put there were false, by the labels.
// Extra findings on a reportable snippet are outside what the labels can judge, so they are left out.
export function categoryRates(runs, snippets) {
  const table = {};
  const entry = (c) => (table[c] ??= { category: c, correct: 0, falsePositive: 0, unjudged: 0 });
  for (const rows of runs) {
    for (const row of rows) {
      const snippet = snippets.find((s) => s.id === row.id);
      for (const finding of row.findings) {
        const line = entry(finding.category);
        if (!snippet.report) line.falsePositive++;
        else if (fits(snippet, finding)) line.correct++;
        else line.unjudged++;
      }
    }
  }
  return Object.values(table).map((line) => {
    const judged = line.correct + line.falsePositive;
    return { ...line, judged, fpRate: judged ? line.falsePositive / judged : 0 };
  });
}

export const pct = (value) => `${(value * 100).toFixed(0)}%`;

export function sumUsage(rowLists) {
  const total = { input_tokens: 0, output_tokens: 0 };
  for (const rows of rowLists) {
    for (const row of rows) {
      total.input_tokens += row.usage.input_tokens;
      total.output_tokens += row.usage.output_tokens;
    }
  }
  return total;
}
