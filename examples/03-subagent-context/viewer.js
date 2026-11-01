// Adapter between the central server and this example's coordinator.
// A real run costs about $1. `stub=1` runs the same code over a scripted stream at no cost, which is
// how the route is checked without paying. The page itself always starts a real run.

import { runCoordinator } from "./coordinator.js";
import { scriptedQuery } from "./scripted-stream.js";

export async function run(params, emit) {
  const topic = params.get("topic")?.trim();
  if (!topic) throw new Error("missing topic");

  const queryFn = params.get("stub") === "1" ? scriptedQuery() : undefined;
  await runCoordinator(topic, { onEvent: emit, queryFn });
}
