// Shape tests for the normalisation layer — no API calls, runs in milliseconds.
//
// These exist because a model returned `subtopics` in the wrong shape and `?? []` did not catch
// it: a default only fires on null and undefined, so an object or a string sails straight through
// into code expecting an array. Every shape that has actually shown up, plus the plausible ones,
// is pinned here.

import assert from "node:assert/strict";
import { asArray, asStringList, normaliseSubtopics, unwrapDecomposition } from "./coordinator.js";

const cases = [];
const check = (name, fn) => cases.push([name, fn]);

check("array of proper subtopics passes through", () => {
  const out = normaliseSubtopics([{ title: "Solar", scope: "PV and CSP" }], "test");
  assert.deepEqual(out, [{ title: "Solar", scope: "PV and CSP" }]);
});

check("array-like object keyed 0,1 is recovered", () => {
  const out = normaliseSubtopics({ 0: { title: "Solar" }, 1: { title: "Wind" } }, "test");
  assert.deepEqual(out.map((s) => s.title), ["Solar", "Wind"]);
});

check("missing scope becomes an empty string, not undefined", () => {
  const [only] = normaliseSubtopics([{ title: "Solar" }], "test");
  assert.equal(only.scope, "");
});

check("junk entries are dropped, good ones kept", () => {
  const out = normaliseSubtopics([{ title: "Solar" }, null, {}, { scope: "orphan" }], "test");
  assert.deepEqual(out.map((s) => s.title), ["Solar"]);
});

check("an array serialised into a JSON string is recovered", () => {
  const raw = JSON.stringify([
    { title: "Solar", scope: "PV and CSP" },
    { title: "Wind", scope: "Onshore and offshore" },
  ]);
  const out = normaliseSubtopics(raw, "test");
  assert.deepEqual(out.map((s) => s.title), ["Solar", "Wind"]);
});

check("a JSON string holding an array-like object is recovered too", () => {
  const raw = JSON.stringify({ 0: { title: "Solar" }, 1: { title: "Wind" } });
  assert.deepEqual(normaliseSubtopics(raw, "test").map((s) => s.title), ["Solar", "Wind"]);
});

check("the whole tool input nested into one field as a JSON string is unwrapped", () => {
  const payload = {
    subtopics: [{ title: "Solar", scope: "PV" }, { title: "Wind", scope: "Turbines" }],
    missingFromFirstPass: ["Tidal"],
    omittedOnPurpose: "nuclear",
  };
  const mangled = { subtopics: JSON.stringify(payload) };

  const out = unwrapDecomposition(mangled);
  assert.deepEqual(out.subtopics.map((s) => s.title), ["Solar", "Wind"]);
  assert.deepEqual(out.missingFromFirstPass, ["Tidal"]);
  assert.equal(out.omittedOnPurpose, "nuclear");
});

check("a well-formed tool input passes through unwrapping untouched", () => {
  const good = { subtopics: [{ title: "Solar" }], missingFromFirstPass: [], omittedOnPurpose: "" };
  assert.equal(unwrapDecomposition(good), good);
});

check("a truncated nested payload is left alone rather than half-parsed", () => {
  const cut = { subtopics: '{"subtopics":[{"title":"Sol' };
  assert.equal(unwrapDecomposition(cut).subtopics, cut.subtopics);
});

check("nothing usable throws rather than returning an empty report", () => {
  assert.throws(() => normaliseSubtopics(null, "test"), /no usable subtopics/);
  assert.throws(() => normaliseSubtopics([], "test"), /no usable subtopics/);
  assert.throws(() => normaliseSubtopics("Solar, Wind", "test"), /no usable subtopics/);
  assert.throws(() => normaliseSubtopics("[broken json", "test"), /no usable subtopics/);
});

check("string list tolerates objects and blanks", () => {
  assert.deepEqual(asStringList(["a", { title: "b" }, { name: "c" }, "", null]), ["a", "b", "c"]);
  assert.deepEqual(asStringList(undefined), []);
});

check("asArray never returns a non-array", () => {
  for (const input of [undefined, null, 0, false, "", {}, [], "x"]) {
    assert.ok(Array.isArray(asArray(input)), `failed for ${JSON.stringify(input)}`);
  }
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
