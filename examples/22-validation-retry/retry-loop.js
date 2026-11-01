// The loop: extract, validate, send errors that another attempt could fix, and hand the rest to a person.

import { extract } from "./extraction.js";
import { applyCodeFigures, buildRetryMessage, validateExtraction } from "./validate.js";

// `seeded` starts from a given failed extraction instead of a real first pass, so the retry path can
// be tested on a model that rarely fails on its own. The retries after it are real calls.
export async function runLoop(sourceText, { seeded, maxRetries = 3, onEvent = () => {} } = {}) {
  const usages = [];
  let result;
  if (seeded) {
    result = seeded;
  } else {
    const first = await extract(sourceText);
    usages.push(first.usage);
    result = first.result;
  }
  const firstErrors = validateExtraction(result, sourceText);
  let errors = firstErrors;
  const history = [{ attempt: 0, seeded: Boolean(seeded), result, errors }];
  onEvent({ attempt: 0, result, errors });
  let retries = 0;

  while (errors.some((e) => e.fixable) && retries < maxRetries) {
    const message = buildRetryMessage(sourceText, result, errors.filter((e) => e.fixable));
    const next = await extract(message);
    usages.push(next.usage);
    result = next.result;
    retries++;
    errors = validateExtraction(result, sourceText, { retried: true });
    history.push({ attempt: retries, message, result, errors });
    onEvent({ attempt: retries, message, result, errors });
  }

  const blocking = errors.filter((e) => !e.advisory);
  const advisories = errors.filter((e) => e.advisory);
  return {
    result: applyCodeFigures(result),
    modelResult: result,
    retries,
    errors: blocking,
    advisories,
    firstErrors,
    history,
    usages,
    status: blocking.length === 0 ? "clean" : "human_review",
    exhausted: retries === maxRetries && errors.some((e) => e.fixable),
    humanReasons: blocking.map((e) => e.message),
  };
}
