// Step 4: stratified sampling, including high-confidence items, tested against a forced drift. Simulated, no model.

import { check, finishChecks } from "../../_shared/check.js";
import { pct, stratifiedSample } from "./calibration.js";
import { productionSet } from "./scenario.js";
import { DOC_TYPES, FIELDS, injectDrift, isCorrect } from "./simulator.js";

const production = productionSet();
const extractions = production.map((d) => d.extraction);
const { sample, sizes } = stratifiedSample(extractions, { sampleRate: 0.05, seed: 7 });

console.table(Object.entries(sizes).map(([stratum, s]) => ({ stratum, population: s.population, sampled: s.sampled, rate: pct(s.sampled / s.population) })));
console.log(`${sample.length} sampled of ${extractions.length}.`);

check("Every stratum, in both bands, is represented", Object.values(sizes).every((s) => s.sampled >= 1));
check("High-confidence strata are sampled", Object.keys(sizes).filter((k) => k.endsWith("-high")).length >= 2 && sample.some((s) => s.stratum.endsWith("-high")));
for (const type of Object.keys(DOC_TYPES)) {
  const volume = extractions.filter((e) => e.documentType === type).length / extractions.length;
  const share = sample.filter((s) => s.documentType === type).length / sample.length;
  check(`${type}: share of sample matches share of volume, within 2 points`, Math.abs(volume - share) < 0.02, `volume ${pct(volume)}, sample ${pct(share)}`);
}
check("The sample has no duplicates", new Set(sample.map((s) => s.id)).size === sample.length);
const tiny = stratifiedSample([{ id: "a", documentType: "rare", overallConfidence: 0.9 }], { sampleRate: 0.05 });
check("A tiny stratum still gets one", tiny.sample.length === 1);
check("The same seed gives the same sample", JSON.stringify(stratifiedSample(extractions, { seed: 7 }).sample.map((s) => s.id)) === JSON.stringify(sample.map((s) => s.id)));

// Forced: 3% of invoices develop wrong amounts with confident scores, and a review that only sees low confidence misses them.
const SHARE = 0.03;
const drifted = injectDrift(production, SHARE, 11);
const driftIds = new Set(drifted.filter((d) => d.extraction.drifted).map((d) => d.extraction.id));
const byId = new Map(drifted.map((d) => [d.extraction.id, d]));
const isHigh = (e) => e.overallConfidence >= 0.8;
const highDrift = drifted.filter((d) => d.extraction.drifted && isHigh(d.extraction)).length;
const lowOnlyPool = drifted.filter((d) => !isHigh(d.extraction));
const lowOnlySeen = lowOnlyPool.filter((d) => d.extraction.drifted).length;
console.log(`\nForced drift: ${driftIds.size} invoices, of which ${highDrift} have high overall confidence and would be automated.`);
console.log(`A review of low confidence alone reaches ${lowOnlySeen} drifted items of ${driftIds.size}, and sees nothing of the ${highDrift} that pass automatically.`);

const RUNS = 200;
let detected = 0;
let sampledDriftTotal = 0;
for (let seed = 1; seed <= RUNS; seed++) {
  const { sample: s } = stratifiedSample(drifted.map((d) => d.extraction), { sampleRate: 0.05, seed });
  const found = s.filter((item) => item.stratum === "invoice-high" && driftIds.has(item.id)).length;
  sampledDriftTotal += found;
  if (found > 0) detected++;
}
console.log(`Over ${RUNS} sampling seeds, stratified sampling put a drifted, automated invoice in front of a reviewer in ${detected} of ${RUNS}, on average ${(sampledDriftTotal / RUNS).toFixed(1)} per sample.`);

const { sample: oneSample } = stratifiedSample(drifted.map((d) => d.extraction), { sampleRate: 0.05, seed: 7 });
const invoiceHigh = oneSample.filter((s) => s.stratum === "invoice-high");
const beforeRate = invoiceHigh.filter((s) => { const clean = production.find((p) => p.extraction.id === s.id); return FIELDS.some((f) => !isCorrect(clean, f)); }).length / invoiceHigh.length;
const afterRate = invoiceHigh.filter((s) => FIELDS.some((f) => !isCorrect(byId.get(s.id), f))).length / invoiceHigh.length;
console.log(`Error rate in one sample of the invoice-high stratum (n=${invoiceHigh.length}): ${pct(beforeRate)} before the drift, ${pct(afterRate)} after.`);

check("The drift really reaches automated items", highDrift > 0 && highDrift / driftIds.size > 0.5);
check("Reviewing low confidence alone misses most of it", lowOnlySeen < highDrift);
check("Stratified sampling detects the drift nearly always", detected / RUNS >= 0.95, `${detected} of ${RUNS}`);
check("The sampled error rate rises with the drift", afterRate > beforeRate, `${pct(beforeRate)} to ${pct(afterRate)}`);

finishChecks();
