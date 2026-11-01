// Free: the recovery decision over the real server, with no model. Backoff waits for real.

import { check, finishChecks } from "../../_shared/check.js";
import { connectCustomerDb } from "./mcp-connection.js";
import { callWithRecovery } from "./recovery.js";

const db = await connectCustomerDb();

async function runModes(modes, identifier = "anna.weber@example.com") {
  const queue = [...modes];
  let calls = 0;
  const outcome = await callWithRecovery(() => {
    calls++;
    return db.callTool({ name: "customer_lookup", arguments: { identifier, mode: queue.shift() ?? "success" } });
  });
  return { ...outcome, calls };
}

const twice = await runModes(["timeout", "timeout"]);
check("Two timeouts then success: recovered after 3 calls", twice.action === "accept" && twice.calls === 3, `delays ${twice.delays}`);
check("Backoff doubles: 1 s, 2 s", twice.delays.join() === "1000,2000");

const started = Date.now();
const always = await runModes(["timeout", "timeout", "timeout", "timeout", "timeout", "timeout"]);
const elapsed = Date.now() - started;
check("Endless timeouts: one call plus 3 retries, then stop", always.action === "escalate_retries_exhausted" && always.calls === 4, `${always.calls} calls`);
check("Backoff really waited about 7 s", elapsed >= 7000 && elapsed < 9000, `${elapsed} ms`);

for (const [mode, action] of [["invalid", "fix_input"], ["business", "escalate_business"], ["permission", "request_credentials"], ["crash", "escalate_unclassified"]]) {
  const outcome = await runModes([mode]);
  check(`${mode} -> ${action}, with no automatic retry`, outcome.action === action && outcome.calls === 1, `${outcome.calls} call`);
}

const empty = await runModes(["not_found"]);
check("Empty result is accepted with no retry", empty.action === "accept_empty" && empty.calls === 1);
const found = await runModes([]);
check("A hit is accepted", found.action === "accept" && found.calls === 1);

await db.close();
finishChecks();
