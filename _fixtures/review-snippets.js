// Labelled code snippets for judging a review prompt: what should be reported, and what should not.
//
// Snippets with `defect` are cut from the _fixtures/codebase/ fixture around a defect in its answer
// key, so the label comes from there. The others are small invented snippets.
// `report: false` means any finding on this snippet is a false positive.
// `core: true` marks the five snippets used for a first small test.

import { DEFECTS, loadCodebase } from "./codebase-answers.js";

function cut(defectId, before, after) {
  const defect = DEFECTS.find((d) => d.id === defectId);
  const lines = loadCodebase().get(defect.file).split("\n");
  const at = lines.findIndex((line) => line.includes(defect.anchor));
  if (at === -1) throw new Error(`Anchor missing for ${defectId}`);
  return lines.slice(Math.max(0, at - before), at + after + 1).join("\n");
}

export const SNIPPETS = [
  // Report: security
  { id: "sql-injection", core: true, report: true, category: "security", severity: "critical", defect: "AUTH-SQL", code: cut("AUTH-SQL", 2, 2) },
  { id: "sql-injection-python", report: true, category: "security", severity: "critical",
    code: 'def find_user(user_input):\n    query = f"SELECT * FROM users WHERE id = {user_input}"\n    return db.execute(query)' },
  { id: "card-in-log", report: true, category: "security", severity: "critical", defect: "PAY-LOG", code: cut("PAY-LOG", 2, 2) },
  // Report: logic
  { id: "null-access", core: true, report: true, category: "logic", severity: "major",
    code: "async function userName(id) {\n  const response = await fetchUser(id); // resolves to { data: null } when the user is unknown\n  return response.data.user.name;\n}" },
  { id: "off-by-one", report: true, category: "logic", severity: "major", defect: "ORD-LOOP", code: cut("ORD-LOOP", 2, 3) },
  { id: "page-short", report: true, category: "logic", severity: "major", defect: "UTIL-PAGE", code: cut("UTIL-PAGE", 3, 2) },
  // Report: a comment that contradicts the code
  { id: "doc-contradiction", report: true, category: "documentation_mismatch", severity: "major",
    code: "// Returns the prices sorted from highest to lowest.\nfunction sortedPrices(prices) {\n  return [...prices].sort((a, b) => a - b);\n}" },
  { id: "doc-contradiction-retries", report: true, category: "documentation_mismatch", severity: "major",
    code: "// Tries the upload three times before giving up.\nasync function upload(file) {\n  return send(file);\n}" },
  // Skip: style and harmless patterns
  { id: "unused-variable", core: true, report: false, category: "none", severity: "none",
    code: "function total(items) {\n  const unused_var = 42;\n  return items.reduce((sum, item) => sum + item.price, 0);\n}" },
  { id: "naming-inconsistency", core: true, report: false, category: "none", severity: "none",
    code: "function greeting() {\n  const userName = getUser();\n  const user_name = userName;\n  return `Hello ${user_name}`;\n}" },
  { id: "formatting", report: false, category: "none", severity: "none",
    code: "function add( a,b ){\n    return a+b\n}" },
  { id: "unused-import", report: false, category: "none", severity: "none",
    code: 'import { readFile, writeFile } from "node:fs/promises";\n\nexport async function load(path) {\n  return readFile(path, "utf8");\n}' },
  // Skip: comments that look stale or informal, yet do not contradict the code
  { id: "doc-accurate", core: true, report: false, category: "none", severity: "none",
    code: "// Tries the upload three times before giving up.\nasync function upload(file) {\n  for (let attempt = 1; attempt <= 3; attempt++) {\n    const ok = await send(file);\n    if (ok) return true;\n  }\n  return false;\n}" },
  { id: "doc-todo", report: false, category: "none", severity: "none",
    code: "// TODO: move this to the config module one day.\nconst PAGE_SIZE = 20;\n\nexport const pageCount = (total) => Math.ceil(total / PAGE_SIZE);" },
  { id: "doc-vague-history", report: false, category: "none", severity: "none",
    code: "// Used to call the old billing service. Now it only adds the numbers up.\nexport function invoiceTotal(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0);\n}" },
  // Skip: correct code that looks suspicious
  { id: "safe-sql", report: false, category: "none", severity: "none",
    code: 'export function findUser(db, id) {\n  return db.query("SELECT id, name FROM users WHERE id = $1", [id]);\n}' },
];

export const CORE_SNIPPETS = SNIPPETS.filter((s) => s.core);
