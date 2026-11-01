// The standard tool loop, driven by stop_reason. `handleTool` receives (name, input) and returns a
// string, or { content, isError } when the model should see the result as an error.

import { client as defaultClient, MODEL } from "./client.js";

export async function runToolLoop({
  prompt,
  messages: startMessages,
  system,
  tools = [],
  toolChoice,
  firstToolChoice,
  handleTool,
  model = MODEL,
  client = defaultClient,
  maxTokens = 1500,
  maxIterations = 12,
  onEvent = () => {},
}) {
  const messages = startMessages ?? [{ role: "user", content: prompt }];
  const toolCalls = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let finalText = "";
  let stopReason = null;
  let iterations = 0;

  while (true) {
    if (iterations >= maxIterations) {
      stopReason = "iteration_cap";
      onEvent({ type: "card", title: "Safety cap reached", badge: "stopped", tone: "warn" });
      break;
    }
    iterations++;

    const choice = iterations === 1 ? firstToolChoice ?? toolChoice : toolChoice;
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...(tools.length ? { tools } : {}),
      ...(choice ? { tool_choice: choice } : {}),
    });
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    stopReason = response.stop_reason;
    messages.push({ role: "assistant", content: response.content });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (text) finalText = text;

    if (response.stop_reason !== "tool_use") break;

    const results = [];
    for (const block of response.content.filter((b) => b.type === "tool_use")) {
      let content;
      let isError = false;
      try {
        const outcome = await handleTool(block.name, block.input);
        if (typeof outcome === "string") content = outcome;
        else ({ content, isError = false } = outcome);
      } catch (error) {
        content = `Error: ${error.message}`;
        isError = true;
      }
      toolCalls.push({ name: block.name, input: block.input, result: content, isError });
      onEvent({ type: "tool", name: block.name, input: block.input, result: content, isError });
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
        ...(isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }

  return { finalText, messages, toolCalls, usage, stopReason, iterations };
}
