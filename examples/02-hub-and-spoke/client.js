import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// .env lives at the repo root, two levels above this example directory.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: resolve(repoRoot, ".env") });

if (!process.env.ANTHROPIC_API) {
  throw new Error("ANTHROPIC_API is missing. Copy .env.example to .env and fill it in.");
}

export const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API,
});

export const MODEL = "claude-sonnet-5-5";

// Forced tool_choice returns a 400 on MODEL, so every call that forces a tool uses this one.
export { FORCED_TOOL_MODEL } from "../../_shared/client.js";
