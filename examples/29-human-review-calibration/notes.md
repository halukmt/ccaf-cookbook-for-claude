# 29 Human review and calibration: notes

**All data is simulated, from fixed seeds, with no model and no API cost.** The accuracies and confidences are parameters I chose in [simulator.js](simulator.js), so the per-cell accuracy table is by construction. It shows how the method behaves, and is no evidence about any real model. What is calculated and could have turned out otherwise: routing outcomes on separate data, the order comparison, and sampling detection. `_fixtures/documents/` has only 20 documents, too few for a curve per cell, so a seeded mock was used. Run 2026-11-01.

**Short version:** the method works, with one result against the usual expectation. At equal review volume, one higher raw threshold let through almost the same number of errors as calibration: 108 vs 104. Calibration's real gain was **where** the errors land: its worst automated cell is 98.7% accurate, against 88.0% for raw at the same volume. And calibrated queue ordering did not beat raw ordering at very small capacity.

## Step 1 — A seeded mock that can be wrong

Files: [simulator.js](simulator.js), [scenario.js](scenario.js), [step-1-3-calibration.js](step-1-3-calibration.js)
What the mock needs in order to work at all:
- Values are wrong sometimes. A mock returning the true value every time would make accuracy always 100%.
- A seeded generator and not `Math.random`, so results repeat. Two checks confirm this.
- International documents are given high scores and poor accuracy, so that a raw 0.80 on international can exist.

## Step 2 — The aggregate hides a 45.5% cell

Executed: 20 of 20 checks with steps 1 and 3. 5,000 production documents, 15,000 fields:

| Type | Vendor | Date | Amount | n per field |
|---|---|---|---|---|
| invoice | 97.7% | 97.1% | 97.7% | 4,069 |
| receipt | 64.9% | 54.9% | 49.6% | 470 |
| scannedPdf | 86.8% | 80.1% | 67.3% | 272 |
| international | 75.1% | 45.5% | 55.0% | 189 |
| **all** | 93.1% | 90.3% | 89.9% | 5,000 |

Aggregate 91.1%, worst cell 45.5%. A high total over a poor cell is the shape the parameters were chosen to produce.

## Step 3 — Calibrate per cell, on separate data

Files: [calibration.js](calibration.js)
Calibrated on a separate validation set of 4,000 documents. A raw 0.85 on international dates is really 52.3%; a raw 0.75 on invoice dates is really 94.6%. A raw 0.85 on amounts means 93.0%, 62.6% or 53.2%, depending on type.
Design points:
- Validation and production are separate sets, so nothing is scored with the data it was calibrated on.
- Bands below 20 items fall back to the whole cell's rate. A band of 1 item at 100% is no evidence.
- Thresholds are per cell. Receipts, scanned documents and international never reach 97%, so every value of theirs goes to a person.

## Step 4 — Stratified sampling sees what confidence hides

Files: [step-4-sampling.js](step-4-sampling.js)
Executed: 13 of 13 checks. 251 of 5,000 sampled across 6 strata, with each type's share within 2 points of its volume.
Forced test: 3% of invoices get wrong amounts with confident scores. Of 115 drifted, 109 pass automatically, and a low-confidence review reaches 6. Over 200 sampling seeds, stratified sampling showed a reviewer a drifted automated invoice in 199, on average 5.2 per sample. The error rate in one sample of that stratum (n=170) rose from 5.9% to 8.8%. A change this size needs a sample big enough to notice; that is a limit worth stating, since only the presence was tested, not whether anyone would raise an alarm.
Sample sizes use `Math.round` with a minimum of one, and not `Math.ceil`, to keep small strata proportional. `overallConfidence` is defined as the lowest field score.

## Step 5 — Calibration moves errors, and costs review capacity

Files: [step-5-router.js](step-5-router.js)
Executed: 16 of 16 checks.
Routing on production data the calibration never saw:

| Policy | To people | Errors in automation | Worst automated cell |
|---|---|---|---|
| Raw at 0.80 | 20.0% | 3.0% (364) | international date, 42.9% (n=91) |
| Calibrated, 97% target | 35.5% | 1.1% (104) | invoice vendor, 98.7% (n=3,498) |
| Raw at equal volume (up to 0.9) | 35.5% | 1.1% (108) | international vendor, 88.0% (n=50) |

Errors caught by a limited reviewer, mean of 20 production seeds:

| Capacity | Raw order | Calibrated order |
|---|---|---|
| 100 | 55.9 | 56.1 |
| 300 | 161.6 | 164.8 |
| 600 | 304.8 | 316.9 |
| 1000 | 446.6 | 514.9 |

Arrival order on the fixed seed caught 19, 70, 143 and 228, well below both.
Reading the tables:
- **Calibration costs review capacity.** It sent 35.5% to people against 20.0%, and most of the gain over raw 0.80 comes from that. It is not a free accuracy win.
- **Calibrated order barely differs from raw until capacity grows.** On the fixed seed, raw even won at 100 and 300 (58 vs 53, 165 vs 155). The lowest raw scores are often truly wrong. Over 20 seeds this evens out; calibrated pulls ahead only from about 600. The first version had no tie-break, and a whole band shared one score, so the raw score now breaks ties. It helped a little.
- My first check asserted that calibrated beats raw at all capacities that bind. It failed, so it was replaced by what the data shows.

The lookup uses `??` and not `||`: with `||`, a calibrated accuracy of 0, the worst possible value, falls back to the raw score. A check covers this. Items are inserted in place rather than the whole queue being re-sorted.

## Viewer

[ui.html](ui.html), [viewer.js](viewer.js). Calculates on request with editable seed, capacity, target and threshold, and no API cost. Checked: route 200, and a run on another seed.

## Takeaways

1. Report accuracy per segment, with its sample size, before automating anything. 91.1% overall here hid a 45.5% cell.
2. Calibrate on labelled data, and test on separate data. Sparse bands should not decide anything.
3. The main value of calibration is keeping bad segments out of automation. Check this directly: the worst automated cell, not just the total error rate.
4. Budget for it. Per-segment thresholds move work to people. Decide whether you can pay for that.
5. Sample automated items as well, or a fault hitting confident outputs stays invisible. Also decide how large a change must be before someone acts.
6. A queue ordered by uncertainty beats arrival order by a wide margin. Calibrated order over raw order is a smaller gain, and it needs enough capacity to show.
