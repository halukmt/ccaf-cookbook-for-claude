// The research subagent: a plain function here, with no model behind it. It retries transient failures itself, and
// only what survives that reaches the coordinator.

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ALTERNATIVES = {
  transient: ["Try alternative data source", "Retry with narrower date range"],
  validation: ["Correct the query parameters"],
  permission: ["Ask an administrator for access"],
  business: ["Ask a person to decide"],
};

function dedupe(list) {
  return [...new Map(list.map((item) => [item.source, item])).values()];
}

// 1 attempt plus 3 retries, waiting 1s, 2s, 4s. Only transient failures are retried; repeating the others cannot help.
export async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, sleep = realSleep } = {}) {
  const partial = [];
  const delays = [];
  let attempts = 0;
  let lastError;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const value = await fn();
      return { ok: true, value: dedupe([...partial, ...value]), attempts, delays };
    } catch (error) {
      lastError = error;
      partial.push(...(error.partialResults ?? []));
      if (error.failureType !== "transient" || attempts > maxRetries) break;
      const delay = baseDelayMs * 2 ** (attempts - 1);
      delays.push(delay);
      await sleep(delay);
    }
  }
  return { ok: false, error: lastError, partialResults: dedupe(partial), attempts, delays };
}

// A query that ran and found nothing is an answer, not a failure.
export async function searchSubagent(topic, { database, dateRange = "2031-01-01/2031-12-31", source = "primary", query = topic, ...retryOptions } = {}) {
  const parameters = { dateRange, source };
  const attempt = await withRetry(() => database.searchDatabase(query, parameters), retryOptions);
  const base = { topic, attempts: attempt.attempts, delays: attempt.delays };

  if (attempt.ok) {
    return {
      ...base, status: "success", results: attempt.value, shouldRetry: false,
      message: attempt.value.length ? `Query executed. ${attempt.value.length} sources found.` : "Query executed successfully. No matching records found.",
    };
  }
  const failureType = attempt.error.failureType ?? "transient";
  return {
    ...base,
    status: attempt.partialResults.length ? "partial_failure" : "error",
    failureType,
    shouldRetry: failureType === "transient",
    message: `${attempt.attempts > 1 ? `Failed after ${attempt.attempts} attempts: ` : ""}${attempt.error.message}`,
    attemptedAction: { tool: "search_database", query, parameters },
    partialResults: attempt.partialResults,
    alternativeApproaches: source === "primary" ? ALTERNATIVES[failureType] : ALTERNATIVES[failureType].filter((text) => !/alternative/.test(text)),
  };
}
