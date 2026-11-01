// Drives the real hook callbacks and the real tool handlers in the order the SDK uses them, with no
// model. It lets a policy be tested against every bad input, at no cost.

import { createHookConfig, createPolicySession } from "./hooks.js";
import { createBankTools, TOOL_PREFIX } from "./tools.js";

export function createHarness(policyOptions) {
  const policy = createPolicySession(policyOptions);
  const state = { executed: [] };
  const tools = Object.fromEntries(createBankTools(state).map((t) => [t.name, t]));
  const hooks = createHookConfig(policy);
  const pre = hooks.PreToolUse[0].hooks[0];
  const post = hooks.PostToolUse[0].hooks[0];

  async function callTool(name, input) {
    const decision = await pre({ tool_name: TOOL_PREFIX + name, tool_input: input });
    if (decision.hookSpecificOutput?.permissionDecision === "deny") {
      return { blocked: true, message: decision.hookSpecificOutput.permissionDecisionReason };
    }
    const result = await tools[name].handler(input, {});
    const output = await post({ tool_name: TOOL_PREFIX + name, tool_input: input, tool_response: result.content });
    return { blocked: false, data: JSON.parse(output.hookSpecificOutput.updatedToolOutput[0].text) };
  }

  const ran = (name) => state.executed.filter((call) => call.name === name);
  return { callTool, ran, policy };
}
