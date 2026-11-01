// Answer key for _fixtures/codebase/: a small invented shop API with planted defects.
//
// The fixture is read-only for examples. Anything that edits files must work on copyCodebase().
// Line numbers are looked up from `anchor` so they cannot drift from the source. A finding counts
// for a defect when it names one of the defect's files and its text matches `match`. That is a coarse
// test, good for counting and bad for judging quality, so read the unmatched findings too.

import { cpSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CODEBASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "codebase");

// Files with no planted defect of their own. They appear only in the contract of cross-file defects.
export const CLEAN_FILES = ["cart.js", "config.js"];

// `pattern` marks the same mistake repeated in several files, to test whether it is judged consistently.
export const DEFECTS = [
  { id: "API-ADMIN", file: "api-routes.js", scope: "local", severity: "critical", anchor: 'router.delete("/admin/users/:id"',
    summary: "Admin delete route has no authentication",
    match: /admin.*(auth|middleware|anyone)|(no|without|missing|neither).*auth.*(admin|delet)/i },
  { id: "API-RATE", file: "api-routes.js", scope: "local", severity: "high", anchor: 'router.post("/login"',
    summary: "No rate limiting on login",
    match: /rate.?limit|brute/i },
  { id: "AUTH-SQL", file: "auth.js", scope: "local", severity: "critical", anchor: "WHERE email = '", pattern: "sql-concat",
    summary: "SQL injection in login",
    match: /sql.?inject|concatenat|interpolat|parameteri[sz]/i },
  { id: "AUTH-MD5", file: "auth.js", scope: "local", severity: "high", anchor: 'createHash("md5")',
    summary: "Passwords hashed with unsalted MD5",
    match: /md5|weak.*hash|unsalted|bcrypt|argon|scrypt/i },
  { id: "DB-LEAK", file: "database.js", scope: "local", severity: "high", anchor: "await connection.query(sql, params)",
    summary: "Connection is not released when the statement fails",
    match: /releas|leak|finally/i },
  { id: "INV-AWAIT", file: "inventory.js", scope: "local", severity: "high", anchor: "query(\"UPDATE stock",
    summary: "The stock update is not awaited",
    match: /await|floating|fire.and.forget|unhandled/i },
  { id: "INV-RACE", file: "inventory.js", scope: "local", severity: "medium", anchor: "const available = await stockLevel(sku)",
    summary: "Check then update is not atomic, so stock can be oversold",
    match: /race|atomic|concurren|toctou|oversell|oversold/i },
  { id: "NOT-XSS", file: "notifications.js", scope: "local", severity: "medium", anchor: "<p>Hello ${user.name}",
    summary: "Unescaped user name in HTML email",
    match: /html|escap|xss|inject|sanitiz/i },
  { id: "NOT-CATCH", file: "notifications.js", scope: "local", severity: "medium", anchor: "} catch (error) {}", pattern: "empty-catch",
    summary: "Mail failures are swallowed by an empty catch",
    match: /swallow|empty catch|catch.*(empty|silent|ignor)|silent|ignor/i },
  { id: "ORD-LOOP", file: "orders.js", scope: "local", severity: "high", anchor: "i <= cart.items.length",
    summary: "Off-by-one loop reads past the end of the cart",
    match: /off.by.one|<=|out of bounds|past the end|undefined/i },
  { id: "PAY-LOG", file: "payments.js", scope: "local", severity: "critical", anchor: 'console.log("Charging card"',
    summary: "Card number and CVC written to the log",
    match: /(card|cvc).*\b(logs?|logged)\b|\b(logs?|logged)\b.*(card|cvc)/i },
  { id: "PAY-CATCH", file: "payments.js", scope: "local", severity: "high", anchor: "} catch (error) {}", pattern: "empty-catch",
    summary: "A failed refund is swallowed and reported as success",
    match: /swallow|empty catch|catch.*(empty|silent|ignor)|silent|ignor|returns? true/i },
  { id: "REP-SQL", file: "reports.js", scope: "local", severity: "critical", anchor: "WHERE created_at BETWEEN '", pattern: "sql-concat",
    summary: "SQL injection in the sales report",
    match: /sql.?inject|concatenat|interpolat|parameteri[sz]/i },
  { id: "REP-CATCH", file: "reports.js", scope: "local", severity: "medium", anchor: "} catch (error) {}", pattern: "empty-catch",
    summary: "Report errors are swallowed and look like an empty report",
    match: /swallow|empty catch|catch.*(empty|silent|ignor)|silent|ignor|hides?|masks?/i },
  { id: "USR-SQL", file: "users.js", scope: "local", severity: "critical", anchor: "WHERE email = '", pattern: "sql-concat",
    summary: "SQL injection in user lookup",
    match: /sql.?inject|concatenat|interpolat|parameteri[sz]/i },
  { id: "UTIL-PAGE", file: "utils.js", scope: "local", severity: "medium", anchor: "start + pageSize - 1",
    summary: "Each page is one item short",
    match: /off.by.one|pageSize ?- ?1|one (item|element|fewer|short)|fewer|too few|exclusive/i },

  // Each of these is correct when its file is read alone. Only the combination is wrong.
  { id: "X-UNITS", file: "orders.js", files: ["orders.js", "cart.js", "payments.js"], scope: "cross-file", severity: "critical", anchor: "chargeCard(card, total)",
    summary: "cartTotal returns cents, chargeCard expects euros: customers are charged 100 times the price",
    match: /100 ?(x|times)|hundred|(expects?|takes?|treated as) .{0,20}\beuros\b|cents.{0,40}(chargeCard|\beuros\b)/i },
  { id: "X-TOKEN", file: "api-routes.js", files: ["api-routes.js", "auth.js"], scope: "cross-file", severity: "critical", anchor: "req.user = verifyToken",
    summary: "verifyToken returns null, but requireUser expects a throw: invalid tokens pass",
    match: /null.*(throw|catch|bypass|next|pass|unauth|check)|(throw|catch|bypass).*null|never throws|does ?n.t throw|not throw/i },
  { id: "X-SHAPE", file: "inventory.js", files: ["inventory.js", "database.js"], scope: "cross-file", severity: "high", anchor: "const [row] = await query",
    summary: "query resolves to { rows, rowCount }, but the caller destructures an array",
    match: /\brows\b.*(not|instead)|not iterable|destructur/i },
  { id: "X-TAX", file: "orders.js", files: ["orders.js", "config.js"], scope: "cross-file", severity: "high", anchor: "config.taxRate",
    summary: "config has vatRate, not taxRate, so the tax is NaN",
    match: /vatRate|taxRate (does not|doesn.t) exist/i },
  { id: "X-ARGS", file: "notifications.js", files: ["notifications.js", "utils.js"], scope: "cross-file", severity: "medium", anchor: 'formatCurrency("EUR", order.total)',
    summary: "formatCurrency is called with its arguments swapped",
    match: /swap|argument order|wrong order|reversed|currency first/i },
  { id: "X-TTL", file: "auth.js", files: ["auth.js", "config.js"], scope: "cross-file", severity: "high", anchor: "expiresIn: config.sessionTtlMinutes",
    summary: "Minutes are passed where the JWT library reads seconds: sessions last 30 seconds",
    match: /second/i },
];

export const defectFiles = (defect) => defect.files ?? [defect.file];

export function loadCodebase(dir = CODEBASE_DIR) {
  const files = readdirSync(dir).filter((name) => name.endsWith(".js")).sort();
  return new Map(files.map((name) => [name, readFileSync(join(dir, name), "utf8")]));
}

// The 1-based line of a defect in the unmodified fixture, or null if its anchor has gone.
export function defectLine(defect, codebase = loadCodebase()) {
  const index = (codebase.get(defect.file) ?? "").split("\n").findIndex((line) => line.includes(defect.anchor));
  return index === -1 ? null : index + 1;
}

// Findings are { file, description }, or { files, description } for cross-file findings.
export function defectsMatchedBy(finding) {
  const files = finding.files ?? [finding.file];
  return DEFECTS.filter(
    (defect) => defectFiles(defect).some((name) => files.includes(name)) && defect.match.test(finding.description ?? "")
  );
}

// Returns the defects found, the defects missed, and the findings that matched no defect.
export function scoreFindings(findings) {
  const found = new Set();
  const unmatched = [];
  for (const finding of findings) {
    const matches = defectsMatchedBy(finding);
    if (matches.length === 0) unmatched.push(finding);
    for (const defect of matches) found.add(defect.id);
  }
  return { found, missed: DEFECTS.filter((defect) => !found.has(defect.id)).map((defect) => defect.id), unmatched };
}

// Examples that edit files must edit this copy. `target` must be an empty temporary directory.
export function copyCodebase(target) {
  cpSync(CODEBASE_DIR, target, { recursive: true });
  return target;
}
