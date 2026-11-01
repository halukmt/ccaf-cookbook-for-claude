// Adapter between the central server and this example's coordinator.

import { runCoordinator } from "./coordinator.js";

// Absent param -> coordinator default. Present param -> use it, including 0, so the round-limit
// trap (0 rounds, gaps left) can be triggered on purpose from the UI, not just by accident.
function optionalNumber(params, key) {
  return params.has(key) ? Number(params.get(key)) : undefined;
}

export async function run(params, emit) {
  const topic = params.get("topic")?.trim();
  if (!topic) throw new Error("missing topic");

  await runCoordinator(topic, {
    onEvent: emit,
    maxDelegations: optionalNumber(params, "maxDelegations"),
    maxRefinementRounds: optionalNumber(params, "rounds"),
  });
}
