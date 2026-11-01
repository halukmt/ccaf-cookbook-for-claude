// Steps 2, 3 and 4: auto, any and a named tool, on the same five document kinds, on the model that
// still accepts forced tool_choice. One script, since the point is the comparison. Paid once.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { callEach, extractDetailTool, extractMetadataTool, extractTool, kindTools, sumUsage, validateInput } from "./tools.js";

const DOC_IDS = ["d01", "d03", "d15", "d14", "d13"];
const store = resultStore(import.meta.url);

const auto = await store.runOnce("auto", () => callEach(DOC_IDS, { tools: [extractTool], toolChoice: { type: "auto" } }));
const any = await store.runOnce("any", () => callEach(DOC_IDS, { tools: kindTools, toolChoice: { type: "any" } }));
const named = await store.runOnce("named", () => callEach(DOC_IDS, {
  tools: [extractMetadataTool, extractDetailTool],
  toolChoice: { type: "tool", name: "extract_metadata" },
}));

// Added after the first run: the forced tool came first, and a second tool often followed it.
const namedSingle = await store.runOnce("named-single", () => callEach(DOC_IDS, {
  tools: [extractMetadataTool, extractDetailTool],
  toolChoice: { type: "tool", name: "extract_metadata", disable_parallel_tool_use: true },
}));

const view = (rows) => rows.map((r) => ({ doc: r.docId, stop: r.stopReason, blocks: r.blockTypes.join("+"), tool: r.toolNames?.join("+") || r.toolName || "none", text: r.text.slice(0, 70) }));
console.log("auto, the document with no instruction:");
console.table(view(auto));
console.log("any, three tools to choose from:");
console.table(view(any));
console.log("named: extract_metadata, with extract_detail beside it:");
console.table(view(named));
console.log("named, with disable_parallel_tool_use:");
console.table(view(namedSingle));

const textOnly = auto.filter((r) => !r.toolName).length;
const schemaFor = (name) => kindTools.find((t) => t.name === name)?.input_schema;
const anyProblems = any.flatMap((r) => (r.toolName ? validateInput(schemaFor(r.toolName), r.input).map((p) => `${r.docId}: ${p}`) : [`${r.docId}: no tool`]));
const usage = sumUsage([...auto, ...any, ...named, ...namedSingle]);
console.log(`auto answered in text only on ${textOnly} of ${auto.length} documents.`);
console.log(`Schema problems under any: ${anyProblems.join("; ") || "none"}`);
console.log(`About ${usd(estimateCost(FORCED_TOOL_MODEL, usage))} at list price.`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectations going in, against this run:");
console.log(`  auto returns text on at least one document   ${yesNo(textOnly > 0)}`);
console.log(`  any always calls a tool                      ${yesNo(any.every((r) => r.stopReason === "tool_use" && r.toolName))}`);
const onlyForced = named.filter((r) => r.toolNames.every((n) => n === "extract_metadata")).length;
console.log(`  named calls only that tool                   ${yesNo(onlyForced === named.length)}  (${onlyForced} of ${named.length})`);

check("auto ran on all five documents", auto.length === 5);
check("Under auto, stop_reason agrees with the blocks", auto.every((r) => (r.stopReason === "tool_use") === r.blockTypes.includes("tool_use")));
check("any: every response called a tool", any.every((r) => r.stopReason === "tool_use" && r.toolName));
check("any: the tool picked fits the document where the kind is clear", any.find((r) => r.docId === "d01").toolName === "extract_invoice" && any.find((r) => r.docId === "d03").toolName === "extract_receipt" && any.find((r) => r.docId === "d15").toolName === "extract_contract");
check("named: the forced tool is called first, even on the detailed invoice", named.every((r) => r.toolNames[0] === "extract_metadata"));
check("named with parallel calls disabled: only the forced tool, every time", namedSingle.every((r) => r.toolNames.length === 1 && r.toolNames[0] === "extract_metadata"));
check("named: the input fits the forced tool",named.every((r) => validateInput(extractMetadataTool.input_schema, r.input).length === 0));
finishChecks();
