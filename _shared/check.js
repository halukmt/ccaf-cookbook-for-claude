// Scripts verify their own claims. A script that exits 0 with wrong content is the failure this
// prevents, so every failed check makes the process exit non-zero when finishChecks() runs.

const results = [];

export function check(label, condition, detail = "") {
  const pass = Boolean(condition);
  results.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  return pass;
}

export function finishChecks() {
  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
  return { total: results.length, failed: failed.length };
}
