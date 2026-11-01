// The Agent SDK spawns a real Claude Code subprocess. Left alone it inherits this process's full
// environment, and it reads and writes the real ~/.claude. The shared isolation gives it only the
// lab's key and a throwaway config directory, and keeps no session on disk. It also caps the budget
// of a run at $1, which the full coordinator overrides, because one full run costs about that much.

import { baseAgentOptions, childEnv } from "../../_shared/agent-env.js";

export const subprocessEnv = childEnv();

// A run in August, through a former API provider, showed Haiku not recognising custom subagents
// passed via options.agents, so this stays on Sonnet. That has not been re-tested on the direct API.
export const MODEL = "claude-sonnet-5-5";

// Shared across every step: no settings from this machine, and no permission prompts, since there
// is no terminal attached to approve anything.
export const baseOptions = {
  ...baseAgentOptions,
  env: subprocessEnv,
  model: MODEL,
};
