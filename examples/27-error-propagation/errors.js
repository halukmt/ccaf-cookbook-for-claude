// The structured result a subagent hands to the coordinator, as a JSON schema, and a small check for it.

export const SUBAGENT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: {
      enum: ["success", "partial_failure", "error"],
      description: "success: the query ran, even if it found nothing. partial_failure: failed, but some data was gathered. error: failed with nothing gathered.",
    },
    failureType: {
      enum: ["transient", "validation", "business", "permission"],
      description: "Decides recovery: transient retries, validation fixes the input, business goes to a person, permission needs an administrator.",
    },
    attemptedAction: {
      type: "object",
      description: "What was tried, so that recovery need not guess.",
      properties: { tool: { type: "string" }, query: { type: "string" }, parameters: { type: "object" } },
      required: ["tool", "query", "parameters"],
    },
    partialResults: { type: "array", description: "Everything retrieved before the failure. Never discarded.", items: { type: "object" } },
    alternativeApproaches: { type: "array", description: "Recovery options the subagent can actually offer.", items: { type: "string" } },
    shouldRetry: { type: "boolean", description: "True for a failed access. False for a query that ran, including one that found nothing." },
    message: { type: "string", description: "A specific cause. 'Search unavailable' tells a coordinator nothing." },
  },
  required: ["status", "shouldRetry", "message"],
};

const FAILURE_FIELDS = ["failureType", "attemptedAction", "partialResults", "alternativeApproaches"];

export function structuredErrorProblems(result) {
  const problems = [];
  const properties = SUBAGENT_RESULT_SCHEMA.properties;
  if (!properties.status.enum.includes(result?.status)) return ["status"];
  if (typeof result.shouldRetry !== "boolean") problems.push("shouldRetry");
  if (typeof result.message !== "string" || result.message.trim().length < 15) problems.push("message");
  if (result.status === "success") {
    if (!Array.isArray(result.results)) problems.push("results");
    return problems;
  }
  for (const field of FAILURE_FIELDS) if (result[field] === undefined) problems.push(field);
  if (result.failureType !== undefined && !properties.failureType.enum.includes(result.failureType)) problems.push("failureType value");
  if (!Array.isArray(result.partialResults)) problems.push("partialResults array");
  if (!Array.isArray(result.alternativeApproaches)) problems.push("alternativeApproaches array");
  if (result.attemptedAction && (typeof result.attemptedAction.tool !== "string" || typeof result.attemptedAction.query !== "string")) problems.push("attemptedAction fields");
  if (result.status === "partial_failure" && !(result.partialResults?.length > 0)) problems.push("partial_failure with no partial results");
  if (result.status === "error" && result.partialResults?.length > 0) problems.push("error while holding partial results");
  return problems;
}
