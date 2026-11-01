// Adapter between the central server and the review passes.
// "saved" re-reads fixed results at no cost. "verify" makes one call for one false control claim.

import { resultStore } from "../../_shared/results.js";
import { estimateCost, usd } from "../../_shared/pricing.js";
import { MODEL } from "../../_shared/client.js";
import { CROSS_DEFECTS, LOCAL_DEFECTS, loadPr, perFileProfile, scorePr } from "./pr.js";
import { CONTROLS, THRESHOLD, routeFinding, verifyFinding } from "./passes.js";

const store = resultStore(import.meta.url);
const pct = (v) => `${(v * 100).toFixed(0)}%`;

function emitSaved(emit) {
  const single = store.load("single-pass");
  const perFile = store.load("per-file");
  const issues = perFile.flatMap((r) => r.issues);
  const s = scorePr(single.issues);
  const m = scorePr(issues);

  emit({ type: "section", title: "One call, or one per file", text: "Ten files, 14 planted local defects and 5 planted cross-file ones. The SQL injections are at positions 6 and 7." });
  emit({ type: "summary", items: [
    [`${s.local.length} of ${LOCAL_DEFECTS.length}`, "local, single pass"],
    [`${m.local.length} of ${LOCAL_DEFECTS.length}`, "local, per file"],
    [`${s.cross.length} of ${CROSS_DEFECTS.length}`, "cross-file, single pass"],
    [`${m.cross.length} of ${CROSS_DEFECTS.length}`, "cross-file, per file"],
    [`${single.issues.length} vs ${issues.length}`, "findings to read"],
  ] });
  const a = perFileProfile(single.issues);
  const b = perFileProfile(issues);
  emit({ type: "card", title: "In review order", tone: "muted", text: a.map((row, i) => `${String(row.position).padStart(2)} ${row.file.padEnd(18)} planted ${row.planted}  single caught ${row.caught}, ${String(row.findings).padStart(2)} findings   per-file caught ${b[i].caught}, ${String(b[i].findings).padStart(2)} findings`).join("\n") });

  emit({ type: "section", title: "Integration pass", text: "What it can find depends on what it is given." });
  for (const [name, file] of [["Findings only", "integration-findings"], ["Findings plus extracted interfaces", "integration-contracts"]]) {
    const r = store.load(file);
    const score = scorePr(r.issues);
    emit({ type: "card", title: name, badge: `${score.cross.length} of ${CROSS_DEFECTS.length}`, tone: score.cross.length === CROSS_DEFECTS.length ? "good" : "warn", text: score.cross.join(", ") || "none" });
  }

  const findings = store.load("confidence-reviews").flatMap((r) => r.issues).map((f) => routeFinding(f));
  emit({ type: "section", title: `Routing at ${THRESHOLD}` });
  emit({ type: "summary", items: [
    [findings.filter((f) => f.route === "direct_report").length, "go to the developer"],
    [findings.filter((f) => f.route === "human_review").length, "go to the human queue"],
  ] });

  const calibration = store.load("calibration");
  const verified = store.load("verifications");
  emit({ type: "section", title: "Independent check", text: `Fresh instances saw the file and the claim only, for ${calibration.sampleSize} of ${calibration.population} findings.` });
  for (const c of calibration.curve) {
    emit({ type: "card", title: `Confidence ${c.band}`, badge: c.n ? `${c.confirmed} of ${c.n} confirmed` : "no findings", tone: c.n === 0 ? "muted" : c.confirmedRate >= 0.9 ? "good" : "warn", text: c.n ? `${pct(c.confirmedRate)} confirmed. ${c.keyMatches} match a planted defect.` : "" });
  }
  emit({ type: "section", title: "False claims mixed in", text: "If the judge confirmed these, its confirmations would mean nothing." });
  for (const c of verified.controls) emit({ type: "card", title: c.file, badge: c.valid ? "wrongly confirmed" : "rejected", tone: c.valid ? "warn" : "good", text: `${c.description}\n\n${c.assessment}` });
}

async function emitVerify(params, emit) {
  const control = CONTROLS[Number(params.get("control") ?? 0)];
  if (!control) throw new Error("Unknown control");
  const code = loadPr().get(control.file);
  const line = code.split("\n").findIndex((text) => text.includes(control.anchor)) + 1;
  emit({ type: "card", title: `Claim about ${control.file}`, badge: "false, by construction", tone: "tool", text: control.description });
  const verdict = await verifyFinding(code, { ...control, line });
  emit({ type: "card", title: "Fresh instance", badge: verdict.valid ? "says valid" : "says invalid", tone: verdict.valid ? "warn" : "good", text: verdict.assessment });
  emit({ type: "summary", items: [[usd(estimateCost(MODEL, verdict.usage)), "computed from tokens and list price"]] });
}

export async function run(params, emit) {
  if ((params.get("mode") ?? "saved") === "saved") return emitSaved(emit);
  return emitVerify(params, emit);
}
