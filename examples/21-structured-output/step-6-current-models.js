// What the current top models need instead of forced tool_choice.
// Records the real 400 on Sonnet 5.5, then runs strict tools with auto and structured outputs.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL, client } from "../../_shared/client.js";
import { getDocument, scoreExtraction, tallyOutcomes } from "../../_fixtures/documents-answers.js";
import { JSON_FORMAT, SCORED_FIELDS, USE_FORMAT, USE_TOOL, callEach, strictSchema, strictTool, sumUsage, validateInput } from "./tools.js";

const IDS = ["d01", "d02", "d10", "d13", "d03"];
const store = resultStore(import.meta.url);

// A rejected request costs nothing. Records the real status and message.
async function attemptForced(toolChoice) {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      tools: [strictTool],
      tool_choice: toolChoice,
      messages: [{ role: "user", content: "Invoice #1 from Acme, dated 2024-01-01." }],
    });
    return { toolChoice, status: 200, stopReason: response.stop_reason };
  } catch (error) {
    return { toolChoice, status: error.status, message: error.error?.error?.message ?? error.message };
  }
}

const rejected = await store.runOnce("forced-attempts", async () => [
  await attemptForced({ type: "any" }),
  await attemptForced({ type: "tool", name: "extract_document" }),
]);
console.table(rejected);

const strictBare = await store.runOnce("strict-auto-bare", () => callEach(IDS, { model: MODEL, tools: [strictTool], toolChoice: { type: "auto" } }));
const strictAsked = await store.runOnce("strict-auto-asked", () => callEach(IDS, { model: MODEL, tools: [strictTool], toolChoice: { type: "auto" }, system: USE_TOOL }));
const formatted = await store.runOnce("output-config", () => callEach(IDS, { model: MODEL, system: USE_FORMAT, outputConfig: { format: JSON_FORMAT } }));

const parsedFormat = formatted.map((r) => ({ ...r, input: r.stopReason === "end_turn" ? JSON.parse(r.text) : null }));
const report = (name, rows) => {
  const answered = rows.filter((r) => r.input);
  const outcomes = answered.map((r) => scoreExtraction(getDocument(r.docId), r.input, SCORED_FIELDS));
  const tally = tallyOutcomes(outcomes);
  const problems = answered.flatMap((r) => validateInput(strictSchema, r.input));
  return {
    arm: name,
    answered: `${answered.length} of ${rows.length}`,
    correct: `${tally.correct + tally.correct_null} of ${tally.fields}`,
    invented: `${tally.fabricated} of ${tally.absent}`,
    schemaProblems: problems.length,
  };
};
const arms = [report("strict + auto, no instruction", strictBare), report("strict + auto, told to use the tool", strictAsked), report("output_config.format", parsedFormat)];
console.table(arms);
console.table(strictBare.map((r) => ({ doc: r.docId, stop: r.stopReason, tool: r.toolName ?? "none", text: r.text.slice(0, 80) })));
console.log(`About ${usd(estimateCost(MODEL, sumUsage([...strictBare, ...strictAsked, ...formatted])))} at list price.`);
store.save("current-models-summary", { rejected, arms });

check("Forced any was rejected with a 400", rejected[0].status === 400, rejected[0].message);
check("A forced named tool was rejected with a 400", rejected[1].status === 400, rejected[1].message);
check("strict with a clear instruction called the tool every time", strictAsked.every((r) => r.toolName === "extract_document"));
check("Strict inputs fit the schema exactly", [...strictBare, ...strictAsked].filter((r) => r.input).every((r) => validateInput(strictSchema, r.input).length === 0));
check("output_config returned schema-valid JSON every time", parsedFormat.every((r) => r.input && validateInput(strictSchema, r.input).length === 0));
check("Answers contain real data", parsedFormat.find((r) => r.docId === "d01").input.vendor_name?.toLowerCase().includes("northwind"));
finishChecks();
