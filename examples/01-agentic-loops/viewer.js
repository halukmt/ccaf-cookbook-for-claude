// Adapter between the central server and this example's code.
//
// The server imports this on demand and calls run(). Keeping it separate means agent-loop.js
// stays a plain library with no knowledge of HTTP.

import { runAgent } from "./agent-loop.js";

export async function run(params, emit) {
  const prompt = params.get("prompt")?.trim();
  if (!prompt) throw new Error("missing prompt");

  const maxIterations = Number(params.get("maxIterations")) || undefined;

  await runAgent(prompt, { maxIterations, onEvent: emit });
}
