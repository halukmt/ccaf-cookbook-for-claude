// PAID, small: the same transformation, three runs of a prose prompt and three of an examples prompt. Haiku, no
// tools. The target is a function neither prompt's examples show, so both arms face the same task.
// Both arms use fetchInvoices, since different functions per arm would be different tasks.
// A short system prompt and an output cap are essential. See notes.md for what happened with the default
// prompt and no tools: the model tried to fake tool calls in text, and two runs burned the output limit.

import { check, finishChecks } from "../../_shared/check.js";
import { runGuarded } from "../../_shared/config-lab.js";
import { newWorkspace, sumCost } from "./refine-lab.js";

const TARGET = "fetchInvoices(customerId: string): Promise<Invoice[]>";
const PROSE = `Refactor ${TARGET} so that its return type is wrapped in a Result type for error handling.`;
const EXAMPLES = `/transform-by-example
Input: getAccountData(accountId: string): Promise<AccountData>
Output: getAccountData(accountId: string): Promise<Result<AccountData, ApiError>>

Input: fetchShipments(customerId: string): Promise<Shipment[]>
Output: fetchShipments(customerId: string): Promise<Result<Shipment[], ApiError>>

Apply to: ${TARGET}`;

const QUIET = {
  tools: "",
  budgetUsd: 0.08,
  env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4000" },
  extraArgs: ["--system-prompt", "You are a TypeScript assistant. You have no tools. Answer in plain text from the request alone."],
};
// The comparable part: the declared return type, whatever else surrounds it in the reply.
const signatureOf = (text) => /fetchInvoices\s*\([^)]*\)\s*:\s*(Promise<[^\n{;]+)/.exec(text)?.[1].replace(/\s+/g, "") ?? null;
const definesType = (text) => /\btype\s+Result\b|\binterface\s+Result\b|\bclass\s+Result\b/.test(text);

async function threeRuns(label, prompt) {
  const runs = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // A fresh workspace each time, so nothing can carry over between attempts.
    runs.push(await runGuarded(newWorkspace(`${label}-${attempt}`), prompt, QUIET));
  }
  const signatures = runs.map((run) => signatureOf(run.text));
  console.log(`\n--- ${label} ---`);
  runs.forEach((run, index) => console.log(`Run ${index + 1} ($${run.costUsd.toFixed(4)}, defines Result: ${definesType(run.text)}):\n${run.text.trim()}\n`));
  return { runs, signatures, distinctSignatures: new Set(signatures).size, distinctOutputs: new Set(runs.map((run) => run.text.trim())).size };
}

const prose = await threeRuns("prose", PROSE);
const examples = await threeRuns("examples", EXAMPLES);

console.log(`Prose: ${prose.distinctSignatures} distinct signatures, ${prose.distinctOutputs} distinct outputs. Examples: ${examples.distinctSignatures} distinct signatures, ${examples.distinctOutputs} distinct outputs.`);
console.log(`Total cost: $${sumCost([...prose.runs, ...examples.runs]).toFixed(4)}`);

check("all six runs succeeded", ![...prose.runs, ...examples.runs].some((run) => run.isError));
console.log("Prose return types:", prose.signatures);
console.log("Examples return types:", examples.signatures);
check("the return type could be read from every run", [...prose.signatures, ...examples.signatures].every(Boolean), "a null here would make the rest meaningless");
check("examples: all three return types are the same", examples.distinctSignatures === 1);
check("examples: that return type is the pattern, with the examples' error type", examples.signatures.every((type) => type === "Promise<Result<Invoice[],ApiError>>"));
check("examples vary no more than prose in the return type", examples.distinctSignatures <= prose.distinctSignatures, `${examples.distinctSignatures} vs ${prose.distinctSignatures}`);
check("prose: ApiError is a convention it cannot guess, so no run used it", !prose.signatures.some((type) => type.includes("ApiError")));
check("the guard refused nothing and no request held private content", ![...prose.runs, ...examples.runs].some((run) => run.blocked > 0 || run.privateSeen));
finishChecks();
