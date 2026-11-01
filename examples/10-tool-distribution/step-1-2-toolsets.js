// Free: the distribution as data, and the guard that enforces it in code.

import { check, finishChecks } from "../../_shared/check.js";
import { createResearchSession } from "./agents.js";
import { agentToolsets, toolNames } from "./toolsets.js";

for (const [agent, config] of Object.entries(agentToolsets)) {
  console.log(`${agent} (${config.tools.length}): ${toolNames(agent).join(", ")}`);
  check(`${agent} has 4 or 5 tools`, config.tools.length >= 4 && config.tools.length <= 5);
}

const all = Object.keys(agentToolsets).flatMap(toolNames);
check("No tool is in two roles", new Set(all).size === all.length, `${all.length} tools`);
check(
  "Every schema is strict-ready",
  Object.values(agentToolsets).every((c) => c.tools.every((t) => t.input_schema.additionalProperties === false && t.input_schema.required.length === Object.keys(t.input_schema.properties).length))
);

const verifyFact = agentToolsets.synthesis.tools.find((t) => t.name === "verify_fact");
check("verify_fact is on the synthesis agent", Boolean(verifyFact));
check("Its description limits it to one source and names the way out", /one source/i.test(verifyFact.description) && verifyFact.description.includes("request_verification"));
check("It accepts one source ID, not a list", verifyFact.input_schema.properties.sourceId.type === "string");

const session = createResearchSession();
const synth = session.handlerFor("synthesis");
const supported = JSON.parse(synth("verify_fact", { claim: "Batch requests are retired", sourceId: "DOC-1" }));
check("verify_fact supports a claim its source states", supported.supported === true);
const unsupported = JSON.parse(synth("verify_fact", { claim: "Quantum routers replaced everything", sourceId: "DOC-1" }));
check("verify_fact rejects a claim its source does not state", unsupported.supported === false);

const stray = synth("search_web", { query: "x" });
check("The guard refuses a tool outside the agent's set", stray.isError === true && /not available/.test(stray.content));
check("The refusal is logged as a cross-role attempt", session.state.log.at(-1).allowed === false);

finishChecks();
