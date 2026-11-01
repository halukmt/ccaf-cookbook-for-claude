// Steps 1 to 3: schema, failed access vs empty result, and local retry. Failures are simulated, no model is involved.
// The retry delays run for real once, so the backoff is measured and not only asserted.

import { check, finishChecks } from "../../_shared/check.js";
import { SUBAGENT_RESULT_SCHEMA as SCHEMA, structuredErrorProblems } from "./errors.js";
import { createDatabase, SearchError } from "./mock-database.js";
import { searchSubagent, withRetry } from "./subagent.js";

const noWait = async () => {};

// Step 1
check("The schema has the four failure types", ["transient", "validation", "business", "permission"].every((t) => SCHEMA.properties.failureType.enum.includes(t)));
check("Every schema field has a description", Object.values(SCHEMA.properties).every((field) => field.description?.length > 10));
check("A vague error is rejected", structuredErrorProblems({ status: "error", shouldRetry: true, message: "search unavailable" }).length >= 4);
check("A result with no status is rejected", structuredErrorProblems({ message: "whatever went wrong here" }).includes("status"));
check("partial_failure with no partial results is rejected", structuredErrorProblems({
  status: "partial_failure", failureType: "transient", shouldRetry: true, message: "Connection timeout after 30s",
  attemptedAction: { tool: "t", query: "q", parameters: {} }, partialResults: [], alternativeApproaches: [],
}).includes("partial_failure with no partial results"));

// Step 2
const empty = createDatabase();
const noMatches = await searchSubagent("customer outages", { database: empty, sleep: noWait });
console.log("Empty result:", JSON.stringify(noMatches));
check("A valid empty result is success with shouldRetry false", noMatches.status === "success" && noMatches.results.length === 0 && noMatches.shouldRetry === false);
check("A valid empty result ran the query exactly once", empty.callsFor("customer outages") === 1 && noMatches.delays.length === 0);
check("A valid empty result passes the schema check", structuredErrorProblems(noMatches).length === 0);

const down = createDatabase();
const failed = await searchSubagent("regional rollout", { database: down, sleep: noWait });
console.log("Failed access:", JSON.stringify(failed));
check("A failed access is error with shouldRetry true", failed.status === "error" && failed.shouldRetry === true && failed.failureType === "transient");
check("A failed access passes the schema check, with all four elements", structuredErrorProblems(failed).length === 0, structuredErrorProblems(failed).join(", "));
check("Failed access and empty result are never equal in shape", failed.status !== noMatches.status && failed.shouldRetry !== noMatches.shouldRetry);

// Step 3
const flaky = createDatabase();
const recovered = await searchSubagent("rollout speed", { database: flaky, sleep: noWait });
check("Two timeouts then success stay inside the subagent", recovered.status === "success" && recovered.attempts === 3 && flaky.callsFor("rollout speed") === 3);
check("The waits were 1s and 2s", recovered.delays.join() === "1000,2000");

const partial = await searchSubagent("gateway patches", { database: createDatabase(), sleep: noWait });
console.log("Partial:", partial.message, partial.partialResults.map((r) => r.title));
check("Partial results accumulate across attempts", partial.status === "partial_failure" && partial.partialResults.length === 3);
check("A source returned twice is counted once", new Set(partial.partialResults.map((r) => r.source)).size === partial.partialResults.length);
check("3 retries means 4 attempts", partial.attempts === 4);

for (const [topic, type] of [["security audit", "permission"], ["legal exemption", "business"], ["migration dates", "validation"]]) {
  const database = createDatabase();
  const result = await searchSubagent(topic, { database, dateRange: "Q2", sleep: noWait });
  check(`${type} failure is not retried`, result.failureType === type && database.callsFor(topic) === 1 && result.delays.length === 0 && result.shouldRetry === false);
}

// Real time: the wait is measured with a real clock. No wait follows the final attempt.
const started = Date.now();
const real = await searchSubagent("regional rollout", { database: createDatabase() });
const elapsed = Date.now() - started;
console.log(`Real backoff: waits ${real.delays.join(", ")} ms, ${elapsed} ms in total.`);
check("Real backoff takes 7 seconds and doubles each time", real.delays.join() === "1000,2000,4000" && elapsed >= 6900 && elapsed < 9000, `${elapsed} ms`);

const thrower = await withRetry(async () => { throw new SearchError("transient", "boom", { partialResults: [{ source: "a" }] }); }, { sleep: noWait, maxRetries: 1 });
check("The helper respects maxRetries", thrower.attempts === 2 && !thrower.ok && thrower.partialResults.length === 1);

finishChecks();
