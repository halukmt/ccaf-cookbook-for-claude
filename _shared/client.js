// Anthropic client shared by every Messages API example.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(repoRoot, ".env"), quiet: true });

if (!process.env.ANTHROPIC_API) {
  throw new Error("ANTHROPIC_API is missing. Copy .env.example to .env and fill it in.");
}

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API });

// Sonnet by default. Haiku for calls that only prove wiring or do high-volume simple work.
export const MODEL = "claude-sonnet-5-5";
export const FAST_MODEL = "claude-haiku-5-5";
// Forced tool_choice ("any" or a named tool) returns a 400 on Sonnet 5.5, Opus 5.5 and Fable 5.1.
// Haiku 5.5 still accepts it. Tested on 2026-10-31.
export const FORCED_TOOL_MODEL = "claude-haiku-5-5";
