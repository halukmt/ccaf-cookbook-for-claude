// Step 4: one shared opening of four turns, then five branches over the remaining six turns.
// Paid once and saved; re-reads the saved run unless --force is passed. Sequential.

import { check, finishChecks } from "../../_shared/check.js";
import { client, MODEL } from "../../_shared/client.js";
import { resultStore } from "../../_shared/results.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { buildPrompt } from "./case-facts.js";
import { CUSTOMER_TURNS, KNOWN_FACTS, newConversation, runTurn, scoreFacts, summarise, SYSTEM, TOOLS } from "./conversation.js";
import { lookupOrder } from "./order-data.js";

const store = resultStore(import.meta.url);

const ARMS = [
  { id: "control", label: "Full history, no summary", summariseAfter: [], style: null, useBlock: false },
  { id: "single", label: "One concise summary after turn 4", summariseAfter: [4], style: "concise", useBlock: false },
  { id: "progressive", label: "Concise summary after turns 4, 6, 8", summariseAfter: [4, 6, 8], style: "concise", useBlock: false },
  { id: "tight", label: "40-word summary after turns 4, 6, 8", summariseAfter: [4, 6, 8], style: "tight", useBlock: false },
  { id: "tight-block", label: "40-word summary after turns 4, 6, 8, plus case facts block", summariseAfter: [4, 6, 8], style: "tight", useBlock: true },
];

async function runArms() {
  const opening = newConversation();
  for (const text of CUSTOMER_TURNS.slice(0, 4)) await runTurn(opening, text);
  console.log(`Opening done, tools: ${opening.turnsLog.flatMap((t) => t.tools).join(", ")}`);

  const arms = [];
  for (const arm of ARMS) {
    const state = structuredClone(opening);
    state.usage = {};
    for (let turn = 5; turn <= CUSTOMER_TURNS.length; turn++) {
      if (arm.summariseAfter.includes(turn - 1)) await summarise(state, arm.style);
      await runTurn(state, CUSTOMER_TURNS[turn - 1], { useBlock: arm.useBlock });
    }
    const answer = state.turnsLog.at(-1).answer;
    arms.push({
      ...arm, facts: state.facts, summaries: state.summaries, turns: state.turnsLog.slice(4), answer,
      score: scoreFacts(answer), relookups: state.relookups, usage: state.usage, finalMessages: state.recent,
    });
    console.log(`${arm.id}: ${arms.at(-1).score.survived.length} of ${KNOWN_FACTS.length} facts in the final answer`);
  }

  // A hand-written lossy summary. Forced: its author removed the facts.
  const forced = {};
  const LOSSY = "The customer would like their money back on an order placed recently";
  const FACTS = { orderId: "#8891", refundAmount: "$247.83", orderDate: "2024-03-03" };
  const usage = {};
  for (const [name, facts] of [["with", FACTS], ["without", null]]) {
    const response = await client.messages.create({
      model: MODEL, max_tokens: 300, system: SYSTEM,
      messages: buildPrompt(facts, LOSSY, "Please confirm the refund details."),
    });
    addUsage(usage, response.usage);
    forced[name] = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return {
    model: MODEL,
    opening: { turns: opening.turnsLog, usage: opening.usage, facts: opening.facts },
    arms,
    forced: { summary: LOSSY, ...forced, usage },
  };
}

const run = await store.runOnce("conversation", runArms);
// Scored here, from the saved text, so a corrected scorer never needs a new paid run.
for (const arm of run.arms) {
  arm.score = scoreFacts(arm.answer);
  for (const summary of arm.summaries) Object.assign(summary, scoreFacts(summary.text));
}

// The API keeps no state, so the history is paid for again on every call. Counting tokens is not billed.
const control = run.arms.find((a) => a.id === "control");
const rawVersion = (messages) => messages.map((message) => !Array.isArray(message.content) ? message : ({
  ...message,
  content: message.content.map((block) => {
    if (block.type !== "tool_result") return block;
    const raw = lookupOrder(JSON.parse(block.content).order_id);
    return raw && JSON.parse(block.content).order_date ? { ...block, content: JSON.stringify(raw) } : block;
  }),
}));
const count = async (messages) => (await client.messages.countTokens({ model: MODEL, system: SYSTEM, tools: TOOLS, messages })).input_tokens;
const trimmedTokens = await count(control.finalMessages);
const rawTokens = await count(rawVersion(control.finalMessages));
const perTurn = [...run.opening.turns, ...control.turns].map((t) => t.inputTokens);
console.log(`\nLast request of the full-history conversation: ${rawTokens} tokens with raw lookups, ${trimmedTokens} trimmed (${((1 - trimmedTokens / rawTokens) * 100).toFixed(1)}% smaller).`);
console.log(`Input tokens billed per turn, control arm: ${perTurn.join(", ")}`);

console.table(run.arms.map((arm) => ({
  arm: arm.label, facts: `${arm.score.survived.length}/${KNOWN_FACTS.length}`,
  lost: arm.score.lost.join("; ") || "-", invented: arm.score.inventedAmounts.join(", ") || "-", relookups: arm.relookups,
})));
for (const arm of run.arms) {
  for (const s of arm.summaries) console.log(`[${arm.id}, after turn ${s.afterTurn}] ${s.survived.length}/${KNOWN_FACTS.length} facts: ${s.text.replace(/\n/g, " ").slice(0, 500)}`);
}
console.log(`\nFINAL tight:\n${run.arms.find((a) => a.id === "tight").answer}`);
console.log(`\nFINAL tight-block:\n${run.arms.find((a) => a.id === "tight-block").answer}`);
console.log("\nForced, hand-written lossy summary, WITH block:", run.forced.with);
console.log("Forced, hand-written lossy summary, WITHOUT block:", run.forced.without);

const total = run.arms.reduce((sum, arm) => addUsage(sum, arm.usage), { ...run.opening.usage });
addUsage(total, run.forced.usage);
console.log(`\nComputed cost: ${usd(estimateCost(MODEL, total))} from ${total.input_tokens} input and ${total.output_tokens} output tokens.`);

const armOf = (id) => run.arms.find((a) => a.id === id);
const blockFacts = KNOWN_FACTS.filter((f) => f.inBlock);
const blockArm = armOf("tight-block");
const issues = blockArm.facts.issues;
const openingTools = run.opening.turns.flatMap((t) => t.tools);
check("The opening really looked up both orders and started one return", openingTools.filter((t) => t === "lookup_order").length >= 2 && openingTools.includes("create_return"));
check("The block holds the known values", issues.find((i) => i.orderId === "#8891")?.orderTotal === 247.83 && issues.find((i) => i.orderId === "#8891")?.rmaId === "RMA-55210" && issues.find((i) => i.orderId === "#8917")?.orderTotal === 64.19);
check("Summaries were really written, three rounds in the progressive arms", armOf("tight").summaries.length === 3 && armOf("progressive").summaries.length === 3 && armOf("single").summaries.length === 1);
check("Each 40-word summary stays close to its limit", run.arms.filter((a) => a.style === "tight").flatMap((a) => a.summaries).every((s) => s.text.split(/\s+/).length <= 60));
check("With the block, every block fact is in the final answer after three summaries", blockFacts.every((f) => blockArm.score.survived.includes(f.name)), `lost: ${blockArm.score.lost.join("; ") || "none"}`);
check("No arm invented a dollar amount", run.arms.every((a) => a.score.inventedAmounts.length === 0), run.arms.flatMap((a) => a.score.inventedAmounts).join(", "));
check("The control arm never saw the customer ID, because the trim list removes it", !armOf("control").score.survived.includes("customer ID"));
check("Forced lossy summary with block: all three values confirmed", /247\.83/.test(run.forced.with) && /8891/.test(run.forced.with) && /2024-03-03|March 3|3 March/.test(run.forced.with));
check("Forced lossy summary without block: none of the values appear", !/247\.83|8891|2024-03-03|March 3/.test(run.forced.without));
check("The last 40-word summary lost the totals and dates of the opening", armOf("tight").summaries.at(-1).lost.includes("total $247.83") && armOf("tight").summaries.at(-1).lost.includes("order date 2024-03-03"));
check("The concise summaries kept them", armOf("progressive").summaries.at(-1).survived.includes("total $247.83"));
check("Without the block, the 40-word arm had to look orders up again; with it, it did not", armOf("tight").relookups > 0 && armOf("tight-block").relookups === 0, `${armOf("tight").relookups} vs ${armOf("tight-block").relookups}`);
check("Trimming reduced the real resent history", trimmedTokens < rawTokens, `${rawTokens} -> ${trimmedTokens}`);
check("The last turn resends more than the first", perTurn.at(-1) > perTurn[0]);

store.save("token-reduction", { rawTokens, trimmedTokens, perTurnInput: perTurn });
finishChecks();
