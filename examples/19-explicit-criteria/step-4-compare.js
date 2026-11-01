// Step 4: vague against explicit, three runs each over all 16 labelled snippets, 96 calls one after
// another. Paid once. Rates come from the labels, with their sample sizes printed beside them.

import { check, finishChecks } from "../../_shared/check.js";
import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { CORE_SNIPPETS, SNIPPETS } from "../../_fixtures/review-snippets.js";
import { EXPLICIT_PROMPT, VAGUE_PROMPT, pct, runPrompt, scoreRun, summarise, sumUsage } from "./review.js";

const RUNS = 3;
const store = resultStore(import.meta.url);

const data = await store.runOnce("step-4-compare", async () => {
  const out = { model: FAST_MODEL, vague: [], explicit: [] };
  for (let run = 0; run < RUNS; run++) {
    console.log(`Run ${run + 1} of ${RUNS}`);
    out.vague.push(await runPrompt(VAGUE_PROMPT, SNIPPETS));
    out.explicit.push(await runPrompt(EXPLICIT_PROMPT, SNIPPETS));
  }
  return out;
});

const line = (name, s) => ({
  set: name,
  tp: s.counts.tp, fp: s.counts.fp, fn: s.counts.fn, tn: s.counts.tn, inflatedFp: s.counts.inflatedFp, extra: s.counts.extra,
  fpRate: `${pct(s.falsePositiveRate)} of ${s.falsePositiveSample}`,
  recall: `${pct(s.recall)} of ${s.recallSample}`,
  precision: pct(s.precision),
  severityRight: pct(s.severityAccuracy),
  inconsistent: `${pct(s.inconsistency.rate)} of ${s.inconsistency.sample}`,
});

const all = { vague: summarise(data.vague, SNIPPETS), explicit: summarise(data.explicit, SNIPPETS) };
const core = { vague: summarise(data.vague, CORE_SNIPPETS), explicit: summarise(data.explicit, CORE_SNIPPETS) };
console.table([line("vague, 16", all.vague), line("explicit, 16", all.explicit), line("vague, core 5", core.vague), line("explicit, core 5", core.explicit)]);
console.log("Unstable under vague:", all.vague.inconsistency.unstable.join(", ") || "none");
console.log("Unstable under explicit:", all.explicit.inconsistency.unstable.join(", ") || "none");

// Per snippet, how often it was flagged, so a wrong decision can be traced to its cause.
console.table(SNIPPETS.map((s) => ({
  snippet: s.id,
  shouldReport: s.report,
  vagueFlagged: data.vague.filter((rows) => rows.find((r) => r.id === s.id).findings.length > 0).length,
  explicitFlagged: data.explicit.filter((rows) => rows.find((r) => r.id === s.id).findings.length > 0).length,
})));

const usage = sumUsage([...data.vague, ...data.explicit]);
console.log(`Tokens ${usage.input_tokens} in, ${usage.output_tokens} out, about ${usd(estimateCost(data.model, usage))} at list price.`);

const yesNo = (value) => (value ? "HELD" : "DID NOT HOLD");
console.log("\nExpectations going in, against this run:");
console.log(`  Fewer false positives with explicit criteria    ${yesNo(all.explicit.falsePositiveRate < all.vague.falsePositiveRate)}`);
console.log(`  Vague shows 30-50% inconsistency                ${yesNo(all.vague.inconsistency.rate >= 0.3 && all.vague.inconsistency.rate <= 0.5)}`);
console.log(`  Explicit below 15% inconsistency                ${yesNo(all.explicit.inconsistency.rate < 0.15)}`);

check("Three runs of each prompt over every snippet",
  data.vague.length === RUNS && data.explicit.length === RUNS && [...data.vague, ...data.explicit].every((rows) => rows.length === SNIPPETS.length));
check("Decisions add up to snippets times runs", ["tp", "fp", "fn", "tn"].reduce((n, k) => n + all.vague.counts[k], 0) === SNIPPETS.length * RUNS);
check("Scoring can say no: flagging nothing gives no true positives", scoreRun(SNIPPETS.map((s) => ({ id: s.id, findings: [] })), SNIPPETS).tp === 0);
check("Scoring can say no: flagging clean code is a false positive", scoreRun([{ id: "safe-sql", findings: [{ severity: "minor", category: "style" }] }], SNIPPETS).fp === 1);
finishChecks();
