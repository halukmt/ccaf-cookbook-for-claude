# Confidence-calibrated review

Measure accuracy per segment on labelled data, automate only segments that earn it, and send the rest to people in order of real uncertainty.

## Use when

- Extraction or classification output is partly automated, partly reviewed by people
- Document or request types differ in how hard they are, and volume is uneven
- Review capacity is limited, and a wrong automated value has a cost

## Do not use when

- Everything is reviewed anyway, or nothing wrong can cost anything
- There is no labelled data, and no way to get it; first get labels
- Volume is so low that per-segment rates would rest on a handful of items

## Decision

Build a labelled validation set. Report accuracy per type and field with sample sizes. Build a curve from reported score to real accuracy per cell, ignoring bands with too few items. Set an automation threshold per cell, or none, so that the whole cell goes to people. Evaluate on separate data. Sample automated output continuously, in every stratum, and decide in advance what change triggers action. Serve the queue lowest calibrated score first, with the raw score breaking ties.

## Trap

An overall number hides failing segments. A single raw threshold automates overconfident types: a raw score has no fixed meaning across document types. Reviewing only low scores is blind to a fault in confident output. Using `||` for a fallback turns an accuracy of 0 into the raw score. And calibration is not free: it moves work to people, and the total error count may match a stricter single threshold while the errors land very differently.

## Example

[calibration.js](../examples/29-human-review-calibration/calibration.js): tracking, curve, thresholds, sampling, queue.
[step-5-router.js](../examples/29-human-review-calibration/step-5-router.js): routing and capacity comparisons on separate data.
[simulator.js](../examples/29-human-review-calibration/simulator.js): the seeded mock. Its accuracies are parameters.

## Verified

2026-11-01, Node 24, seeded simulation only, with no model, so this shows the method and not real model behaviour. 4,000 labelled documents, 5,000 separate ones. Aggregate 91.1%, worst cell 45.5% (n=189). Raw at 0.80: 20.0% reviewed, 3.0% automated errors, worst automated cell 42.9%. Calibrated at 97%: 35.5% reviewed, 1.1%, worst cell 98.7%. A single raw threshold at equal volume: 1.1%, worst cell 88.0%. Mean errors caught at 1,000 reviews over 20 seeds: 514.9 calibrated, 446.6 raw. At 100: 56.1 and 55.9. A forced 3% drift in confident invoices appeared in stratified samples for 199 of 200 seeds.

## Usual advice vs observed

Calibration is often presented as simply better than a raw score. In this simulation, a stricter raw threshold matched its total error count at the same review volume. Its gain lay in the distribution of errors. And queueing by calibrated score gave almost nothing over raw score until capacity was large.
