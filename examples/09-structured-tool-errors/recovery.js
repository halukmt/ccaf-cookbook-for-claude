// Recovery decided by code from the error's metadata, and an agent that runs through it.

import { FAST_MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";
import { connectCustomerDb } from "./mcp-connection.js";

const CATEGORIES = { transient: true, validation: true, business: false, permission: false };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const resultText = (result) => result.content?.[0]?.text ?? "";

// Anything that does not parse into known metadata is "unclassified", and code never retries an
// error it cannot classify. Blind retries on a real bug are the failure this avoids.
export function readMetadata(result) {
  try {
    const data = JSON.parse(resultText(result));
    const known =
      data.errorCategory in CATEGORIES && data.isRetryable === CATEGORIES[data.errorCategory] && typeof data.description === "string";
    return known ? data : null;
  } catch {
    return null;
  }
}

// `call` is one real tool call. Only transient errors are retried here: 1 s, 2 s, 4 s, then give up.
export async function callWithRecovery(call, { maxRetries = 3, baseDelayMs = 1000, sleep = wait } = {}) {
  const delays = [];
  for (let attempt = 1; ; attempt++) {
    const result = await call();
    const base = { result, attempts: attempt, delays };

    if (!result.isError) {
      return { ...base, action: JSON.parse(resultText(result)).resultCount === 0 ? "accept_empty" : "accept" };
    }
    const metadata = readMetadata(result);
    if (!metadata) return { ...base, action: "escalate_unclassified" };

    switch (metadata.errorCategory) {
      case "transient":
        if (attempt > maxRetries) return { ...base, metadata, action: "escalate_retries_exhausted" };
        delays.push(baseDelayMs * 2 ** (attempt - 1));
        await sleep(delays.at(-1));
        continue;
      case "validation":
        return { ...base, metadata, action: "fix_input" };
      case "business":
        return { ...base, metadata, action: "escalate_business" };
      case "permission":
        return { ...base, metadata, action: "request_credentials" };
    }
  }
}

const SYSTEM =
  "You are a customer support assistant. Use customer_lookup to answer. Say plainly what the tool result " +
  "shows and never invent customer data. If the tool says the case was handed over, tell the user that and stop.";

// The model never sees `mode`. The harness picks the failure, so a scenario cannot be talked out of it.
const MODEL_TOOLS = [{
  name: "customer_lookup",
  description: "Finds one customer by email address or customer ID.",
  input_schema: {
    type: "object",
    properties: { identifier: { type: "string", description: "Customer email or ID" } },
    required: ["identifier"],
  },
}];

const MAX_INPUT_FIXES = 2;

// `modes` is consumed one per real server call; after that, calls run in success mode.
export async function runRecoveryAgent({ prompt, modes = [], model = FAST_MODEL, retryOptions, onEvent = () => {} }) {
  const db = await connectCustomerDb();
  const queue = [...modes];
  const state = {
    serverCalls: [],
    escalations: [],
    credentialRequests: [],
    refusedAfterStop: [],
    repeatedBadInput: 0,
    actions: [],
  };
  let stopped = false;
  let fixes = 0;
  let lastInvalid = null;

  function handOver(outcome, reason, list, recovery) {
    stopped = true;
    list.push({ reason, description: outcome.metadata?.description ?? resultText(outcome.result) });
    return {
      content: JSON.stringify({ ...(outcome.metadata ?? {}), recovery, note: "Handed over by the system. Do not call the tool again." }),
      isError: true,
    };
  }

  async function handleTool(name, input) {
    if (name !== "customer_lookup") throw new Error(`Unknown tool: ${name}`);
    if (stopped) {
      state.refusedAfterStop.push(input);
      return { content: "Refused: this case has already been handed over.", isError: true };
    }
    if (input.identifier === lastInvalid) state.repeatedBadInput++;

    const outcome = await callWithRecovery(async () => {
      const mode = queue.shift() ?? "success";
      state.serverCalls.push({ identifier: input.identifier, mode });
      return db.callTool({ name, arguments: { identifier: input.identifier, mode } });
    }, retryOptions);
    state.actions.push({ action: outcome.action, attempts: outcome.attempts, delays: outcome.delays, identifier: input.identifier });
    onEvent({ type: "card", title: outcome.action, badge: `${outcome.attempts} server call(s)`, tone: outcome.action.startsWith("accept") ? "good" : "warn",
      text: outcome.delays.length ? `Backoff: ${outcome.delays.join(" ms, ")} ms` : undefined, data: resultText(outcome.result) });

    switch (outcome.action) {
      case "accept":
      case "accept_empty":
        return resultText(outcome.result);
      case "fix_input":
        lastInvalid = input.identifier;
        if (++fixes > MAX_INPUT_FIXES) return handOver(outcome, "input could not be fixed", state.escalations, "escalated");
        return { content: resultText(outcome.result), isError: true };
      case "request_credentials":
        return handOver(outcome, outcome.action, state.credentialRequests, "credentials_requested");
      default:
        return handOver(outcome, outcome.action, state.escalations, "escalated");
    }
  }

  try {
    const loop = await runToolLoop({ prompt, system: SYSTEM, tools: MODEL_TOOLS, handleTool, model, maxTokens: 600, onEvent });
    return { ...loop, state };
  } finally {
    await db.close();
  }
}

// One preset per branch of the recovery logic.
export const SCENARIOS = {
  success: { prompt: "Look up the customer anna.weber@example.com.", modes: [] },
  empty: { prompt: "Look up the customer nobody@example.com.", modes: [] },
  transient: { prompt: "Look up the customer anna.weber@example.com.", modes: ["timeout", "timeout"] },
  exhausted: { prompt: "Look up the customer anna.weber@example.com.", modes: ["timeout", "timeout", "timeout", "timeout"] },
  validation: { prompt: "Look up customer number 1001.", modes: [] },
  business: { prompt: "Look up anna.weber@example.com for her refund of 750.", modes: ["business"] },
  permission: { prompt: "Look up the financial records of anna.weber@example.com.", modes: ["permission"] },
  unclassified: { prompt: "Look up the customer anna.weber@example.com.", modes: ["crash"] },
};
