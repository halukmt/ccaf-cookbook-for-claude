// Step 5: four arms over twelve modules on Haiku 5.5, one run per arm, sequential. Paid once and saved.
// Measured: recall and wrong entries against real exports, generic wording, tokens. Context size is also reported.
// "Attention quality" is not something these numbers can observe directly, and the notes say so.

import { check, finishChecks } from "../../_shared/check.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { addUsage, estimateCost, usd } from "../../_shared/pricing.js";
import { resultStore } from "../../_shared/results.js";
import { exploreModules, measureSpecificity, MODULES, scorePairs } from "./comparison.js";
import { exportsByFile } from "./workspace.js";

const store = resultStore(import.meta.url);

const ARMS = [
  { id: "full", label: "No scratchpad, full history", useScratchpad: false, dropOld: false },
  { id: "full-pad", label: "Scratchpad, full history", useScratchpad: true, dropOld: false },
  { id: "dropped", label: "Forced: no scratchpad, old tool calls dropped", useScratchpad: false, dropOld: true },
  { id: "dropped-pad", label: "Forced: scratchpad, old tool calls dropped", useScratchpad: true, dropOld: true },
];

const run = await store.runOnce("comparison", async () => {
  const arms = [];
  for (const arm of ARMS) {
    arms.push({ ...arm, ...(await exploreModules(MODULES, arm)) });
    console.log(`${arm.id}: done`);
  }
  return { model: FAST_MODEL, modules: MODULES, arms };
});

// Scored from saved text, so a corrected scorer never needs a new paid run.
const scored = run.arms.map((arm) => ({ ...arm, score: scorePairs(arm.answer, run.modules), specificity: measureSpecificity(arm.answer) }));
const arm = (id) => scored.find((a) => a.id === id);

console.table(scored.map((a) => ({
  arm: a.label, recall: `${a.score.correct}/${a.score.expected}`, wrong: a.score.wrong.length, specific: a.specificity.specificRefs, generic: a.specificity.genericRefs,
  reads: a.filesRead.length, lateReads: a.lateReads, input: a.usage.input_tokens, output: a.usage.output_tokens, lastTurnInput: a.perTurnInput.at(-1),
})));
for (const a of scored) {
  console.log(`\n--- ${a.label}\n${a.answer}\nMissing: ${a.score.missing.join(", ") || "none"}\nWrong: ${a.score.wrong.join(", ") || "none"}`);
}
console.log(`\nScratchpad of the last arm (first 700 chars):${arm("dropped-pad").scratchpad.slice(0, 700)}`);
const total = run.arms.reduce((sum, a) => addUsage(sum, a.usage), {});
console.log(`\nComputed cost ${usd(estimateCost(run.model, total))}.`);

check("The ground truth has real size", scored[0].score.expected >= 20, `${scored[0].score.expected} pairs in ${exportsByFile().size} files`);
check("Every arm really explored more than five modules", scored.every((a) => new Set(a.filesRead).size >= 6), scored.map((a) => new Set(a.filesRead).size).join(", "));
check("Every arm gave a non-empty answer", scored.every((a) => a.answer.trim().length > 40));
check("Arms holding the data listed real names", ["full", "full-pad", "dropped-pad"].every((id) => arm(id).score.correct > 0));
check("Arms holding the data listed no wrong export", ["full", "full-pad", "dropped-pad"].every((id) => arm(id).score.wrong.length === 0));
console.log(`Forced drop, no scratchpad, wrong entries: ${arm("dropped").score.wrong.join(", ") || "none"}.`);
check("The forced drop without a scratchpad warned that its list is unverified", /not verified|none of these are verified|unverified/i.test(arm("dropped").answer));
check("Scratchpad arms wrote real files with real names", ["full-pad", "dropped-pad"].every((id) => /placeOrder/.test(arm(id).scratchpad) && /payments\.js/.test(arm(id).scratchpad)));
check("Arms without a scratchpad wrote none", ["full", "dropped"].every((id) => arm(id).scratchpad === ""));
check("The forced drop removed what the arm had read", arm("dropped").perTurnInput.at(-1) < arm("full").perTurnInput.at(-1), `${arm("dropped").perTurnInput.at(-1)} vs ${arm("full").perTurnInput.at(-1)} tokens on the final question`);
check("A scratchpad recovers specifics once tool history has been dropped", arm("dropped-pad").score.correct > arm("dropped").score.correct, `${arm("dropped-pad").score.correct} vs ${arm("dropped").score.correct} of ${scored[0].score.expected}`);

store.save("comparison-score", scored.map((a) => ({ id: a.id, label: a.label, correct: a.score.correct, expected: a.score.expected, wrong: a.score.wrong, missing: a.score.missing, specificity: a.specificity, reads: a.filesRead.length, inputTokens: a.usage.input_tokens, outputTokens: a.usage.output_tokens, finalTurnInput: a.perTurnInput.at(-1), answer: a.answer })));
finishChecks();
