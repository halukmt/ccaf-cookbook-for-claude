// Four investigations of this fixture. Truth is known in advance for each one.
// The fixture really has no test files and no route reaching refundCharge, and the model is not told so.

export const INVESTIGATIONS = [
  { subagent: "test-coverage", task: "Locate every test file covering the order code and state the coverage status." },
  { subagent: "refund-flow", task: "Trace the refund flow from the API endpoint to the database, listing all intermediate functions." },
  { subagent: "external-apis", task: "Identify all external integrations, meaning imports from outside this codebase, and their error handling patterns." },
  { subagent: "order-flow", task: "Trace what happens from the POST /orders route to the database, listing all intermediate functions in order." },
];

const text = (findings) => findings.map((f) => JSON.stringify(f)).join(" ");

// Each returns { pass, detail } from the subagent's reported findings, against what the files really say.
export const TRUTH = {
  "test-coverage": (findings) => ({ pass: /\bno\b[^"]{0,40}test|test[^"]{0,40}\b(none|not found|missing|do not exist|does not exist)\b|\b0\b[^"]{0,10}test/i.test(text(findings)), detail: "the fixture has no test files" }),
  "refund-flow": (findings) => ({
    pass: /refundCharge/.test(text(findings)) && /payments\.js/.test(text(findings)) && /\bno\b[^"]{0,60}(route|endpoint|caller)|not[^"]{0,40}(called|reached|exposed|wired|imported)|never[^"]{0,30}(called|reached)|unused/i.test(text(findings)),
    detail: "refundCharge exists in payments.js, and nothing calls it",
  }),
  "external-apis": (findings) => ({ pass: /express/.test(text(findings)) && /provider/.test(text(findings)), detail: "imports express and a payment provider stub" }),
  "order-flow": (findings) => ({
    pass: ["placeOrder", "reserveStock", "cartTotal", "chargeCard", "query"].every((name) => text(findings).includes(name)),
    detail: "placeOrder calls reserveStock, cartTotal, chargeCard, then query",
  }),
};

// Phase 2 checks two cross-file defects from the answer key.
export const PHASE2_TASKS = [
  { subagent: "money-units", defect: "X-UNITS", task: "Follow the money amount through placeOrder. State the unit each function uses, and any mismatch." },
  { subagent: "token-check", defect: "X-TOKEN", task: "Follow an invalid token through requireUser and verifyToken. State what happens, and whether it can pass." },
];
