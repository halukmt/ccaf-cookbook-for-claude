// The two hook directions. Everything that decides is a plain function, so it can be tested with no
// model. The SDK callbacks at the bottom only translate to and from the hook format.

import { TOOL_PREFIX } from "./tools.js";

export const DEFAULT_REFUND_LIMIT = 500;

const STATUS_WORDS = { 200: "active", 404: "not_found", S: "shipped", P: "pending" };
const SLASH_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// Returns an ISO 8601 string, or null when the value cannot be read with confidence.
export function normaliseDate(value) {
  if (typeof value === "number") {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== "string") return null;

  const slash = value.match(SLASH_DATE);
  if (slash) {
    const [day, month, year] = slash.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC rolls 31/02 over to March and 03/13 into the next year. Reject both.
    const roundTrips = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return roundTrips ? date.toISOString() : null;
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Codes become words. A code nobody mapped must not pass as if it were clean.
export function normaliseStatus(value) {
  const word = STATUS_WORDS[String(value)];
  if (word) return word;
  if (typeof value === "string" && value.length > 1) return value;
  return "unknown";
}

export function normaliseRecord(record) {
  const normalised = { ...record };
  const problems = [];

  if ("created_at" in record) {
    const date = normaliseDate(record.created_at);
    if (date) normalised.created_at = date;
    else {
      normalised.created_at = "unknown";
      problems.push({ field: "created_at", raw: record.created_at });
    }
  }
  if ("status" in record) {
    normalised.status = normaliseStatus(record.status);
    if (normalised.status === "unknown") problems.push({ field: "status", raw: record.status });
  }
  // The raw value stays visible next to "unknown", so nobody treats a parse failure as data.
  if (problems.length > 0) normalised.normalisation_problems = problems;
  return normalised;
}

const bareName = (toolName) =>
  toolName.startsWith(TOOL_PREFIX) ? toolName.slice(TOOL_PREFIX.length) : toolName;

// All session state lives here, so one conversation can never unlock another.
export function createPolicySession({ refundLimit = DEFAULT_REFUND_LIMIT } = {}) {
  return { refundLimit, amlPassed: new Set(), escalations: [], blocked: [], normalised: [] };
}

function escalationFor(session, input) {
  const known = session.escalations.find(
    (entry) => entry.customer_id === input.customer_id && entry.amount === input.amount
  );
  if (known) return known;
  const entry = {
    reference: `ESC-${1001 + session.escalations.length}`,
    customer_id: input.customer_id,
    amount: input.amount,
  };
  session.escalations.push(entry);
  return entry;
}

// Refund threshold. Anything that is not a clean number is refused: a policy that cannot read the
// amount must not wave the call through.
export function refundDecision(session, input) {
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) {
    return { blocked: true, message: "Refund refused: the amount is not a number." };
  }
  if (input.amount > session.refundLimit) {
    const { reference } = escalationFor(session, input);
    return {
      blocked: true,
      message:
        `Refund of ${input.amount} exceeds the limit of ${session.refundLimit} and was not processed. ` +
        `It has been placed in the human escalation queue. Reference: ${reference}.`,
    };
  }
  return { blocked: false };
}

// AML prerequisite. Keyed by customer: one customer's pass says nothing about another's transfer.
export function transferDecision(session, input) {
  if (!session.amlPassed.has(input.customer_id)) {
    return {
      blocked: true,
      message:
        `COMPLIANCE BLOCK: no passing aml_check for customer ${input.customer_id} in this session. ` +
        "International transfers require a passing aml_check first.",
    };
  }
  return { blocked: false };
}

const POLICIES = { process_refund: refundDecision, transfer_funds: transferDecision };

export function preToolDecision(session, toolName, input) {
  const policy = POLICIES[bareName(toolName)];
  const decision = policy ? policy(session, input) : { blocked: false };
  if (decision.blocked) session.blocked.push({ tool: bareName(toolName), input, message: decision.message });
  return decision;
}

// Runs after the tool, so it records facts and rewrites what the model will read. It cannot prevent
// anything: by now the tool has already run.
export function postToolRecord(session, toolName, input, raw) {
  const name = bareName(toolName);
  if (name === "aml_check" && raw.status === "pass") session.amlPassed.add(input.customer_id);
  const normalised = normaliseRecord(raw);
  session.normalised.push({ tool: name, raw, normalised });
  return normalised;
}

// tool_response is declared `unknown` by the SDK, so its shape is checked rather than assumed.
function responseBlocks(toolResponse) {
  if (Array.isArray(toolResponse)) return toolResponse;
  if (Array.isArray(toolResponse?.content)) return toolResponse.content;
  throw new Error(`Unexpected tool_response shape: ${JSON.stringify(toolResponse)}`);
}

// `onEvent` lets a viewer watch decisions without the library knowing about HTTP.
export function createHookConfig(session, { onEvent = () => {} } = {}) {
  const preToolUse = async (input) => {
    // A policy that crashes must refuse. See step-6-broken-hook.js for what the SDK does otherwise.
    let decision;
    try {
      decision = preToolDecision(session, input.tool_name, input.tool_input);
    } catch (error) {
      decision = { blocked: true, message: `Policy check failed, so the call was refused: ${error.message}` };
      session.blocked.push({ tool: bareName(input.tool_name), input: input.tool_input, message: decision.message });
    }
    onEvent({ hook: "PreToolUse", tool: bareName(input.tool_name), input: input.tool_input, ...decision });
    if (!decision.blocked) return { continue: true };
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.message,
      },
    };
  };

  const postToolUse = async (input) => {
    const blocks = responseBlocks(input.tool_response);
    const raw = JSON.parse(blocks[0].text);
    const normalised = postToolRecord(session, input.tool_name, input.tool_input, raw);
    const responseShape = Array.isArray(input.tool_response) ? "array" : "object";
    onEvent({ hook: "PostToolUse", tool: bareName(input.tool_name), raw, normalised, responseShape });
    const updated = [{ type: "text", text: JSON.stringify(normalised) }];
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: Array.isArray(input.tool_response)
          ? updated
          : { ...input.tool_response, content: updated },
      },
    };
  };

  return {
    PreToolUse: [{ matcher: `${TOOL_PREFIX}.*`, hooks: [preToolUse] }],
    PostToolUse: [{ matcher: `${TOOL_PREFIX}.*`, hooks: [postToolUse] }],
  };
}
