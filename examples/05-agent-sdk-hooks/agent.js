// Runs the agent with the hooks attached. The system prompt says nothing about refund limits or AML:
// whatever is enforced here is enforced by code.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { baseAgentOptions, childEnv, makeTempDir } from "../../_shared/agent-env.js";
import { startApiCapture, toolResultsSent } from "../../_shared/api-capture.js";
import { FAST_MODEL } from "../../_shared/client.js";
import { createHookConfig, createPolicySession } from "./hooks.js";
import { createBankServer, createBankTools, SERVER_NAME, TOOL_PREFIX } from "./tools.js";

const SYSTEM =
  "You are a back-office assistant with tools for customers, orders, shipments, refunds, " +
  "AML checks and transfers. Do what the user asks with your tools, then report the outcome. " +
  "Quote dates and statuses exactly as the tools returned them.";

// `hooksOverride` replaces the real hooks, for the example that tests a deliberately broken hook.
export async function runBankAgent(
  prompt,
  { hooksEnabled = true, hooksOverride, refundLimit, onEvent = () => {} } = {}
) {
  const policy = createPolicySession(refundLimit === undefined ? {} : { refundLimit });
  const state = { executed: [] };
  const tools = createBankTools(state);
  const capture = await startApiCapture();

  const hookEvents = [];
  const hooks = createHookConfig(policy, {
    onEvent: (event) => {
      hookEvents.push(event);
      onEvent(event);
    },
  });

  let finalText = "";
  let costUsd = 0;
  let availableTools = [];
  try {
    const stream = query({
      prompt,
      options: {
        ...baseAgentOptions,
        env: childEnv({ extra: { ANTHROPIC_BASE_URL: capture.url } }),
        cwd: makeTempDir("hooks-cwd"),
        model: FAST_MODEL,
        systemPrompt: SYSTEM,
        tools: [],
        mcpServers: { [SERVER_NAME]: createBankServer(tools) },
        allowedTools: [`${TOOL_PREFIX}*`],
        maxTurns: 15,
        ...(hooksEnabled ? { hooks: hooksOverride ?? hooks } : {}),
      },
    });

    for await (const message of stream) {
      if (message.type === "system" && message.subtype === "init") availableTools = message.tools;
      if (message.type === "result") {
        costUsd += message.total_cost_usd ?? 0;
        if (typeof message.result === "string") finalText = message.result;
      }
    }
  } finally {
    await capture.close();
  }

  return {
    finalText,
    costUsd,
    availableTools,
    policy,
    executed: state.executed,
    hookEvents,
    toolResults: toolResultsSent(capture.requests),
    apiRequests: capture.requests.length,
  };
}
