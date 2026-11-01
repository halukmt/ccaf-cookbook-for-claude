// Live, on the fast model: one agent run per recovery branch, through the real MCP server.

import { check, finishChecks } from "../../_shared/check.js";
import { runRecoveryAgent, SCENARIOS } from "./recovery.js";

const totals = { input: 0, output: 0 };

async function scenario(name) {
  const run = await runRecoveryAgent(SCENARIOS[name]);
  totals.input += run.usage.input_tokens;
  totals.output += run.usage.output_tokens;
  console.log(`\n=== ${name}`);
  console.log("server calls:", run.state.serverCalls.map((c) => `${c.mode}(${c.identifier})`).join(", "));
  console.log("actions:", run.state.actions.map((a) => a.action).join(", "));
  console.log("answer:", run.finalText.slice(0, 240).replace(/\n/g, " "));
  return run;
}

const success = await scenario("success");
check("success: one server call, name in the answer", success.state.serverCalls.length === 1 && /Anna Weber/.test(success.finalText));

const empty = await scenario("empty");
check("empty: one server call, no retry of a valid empty result", empty.state.serverCalls.length === 1 && empty.state.actions[0].action === "accept_empty");
check("empty: the answer says nothing was found", /no customer|not found|no match|couldn't find|could not find|no record/i.test(empty.finalText));
check("empty: no escalation", empty.state.escalations.length === 0);

const transient = await scenario("transient");
check("transient: code retried, the model made one call", transient.toolCalls.length === 1 && transient.state.serverCalls.length === 3);
check("transient: the model only saw the success", !transient.toolCalls[0].isError && /Anna Weber/.test(transient.finalText));

const exhausted = await scenario("exhausted");
check("exhausted: 4 server calls and an escalation", exhausted.state.serverCalls.length === 4 && exhausted.state.escalations.length === 1);

const validation = await scenario("validation");
const identifiers = validation.state.serverCalls.map((c) => c.identifier);
check("validation: the first input really was invalid", validation.state.actions[0]?.action === "fix_input", identifiers.join(" -> "));
check("validation: the model changed the input, and it worked", identifiers.at(-1) === "C-1001" && validation.state.actions.at(-1).action === "accept", identifiers.join(" -> "));
check("validation: the same bad input was not sent again", validation.state.repeatedBadInput === 0);

const business = await scenario("business");
check("business: one server call, escalated, no retry", business.state.serverCalls.length === 1 && business.state.escalations[0]?.reason === "escalate_business");

const permission = await scenario("permission");
check("permission: one server call, credentials requested", permission.state.serverCalls.length === 1 && permission.state.credentialRequests.length === 1);

const unclassified = await scenario("unclassified");
check("unclassified: a crash is escalated, never retried", unclassified.state.serverCalls.length === 1 && unclassified.state.escalations[0]?.reason === "escalate_unclassified");

const stopped = [business, permission, unclassified, exhausted];
console.log(`\nCalls refused after a stop: ${stopped.map((r) => r.state.refusedAfterStop.length).join(", ")}`);
console.log(`Tokens: ${totals.input} in, ${totals.output} out.`);
finishChecks();
