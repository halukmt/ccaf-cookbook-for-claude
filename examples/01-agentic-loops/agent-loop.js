// The agentic loop — grown across steps 3 to 6 of example 01.
//
// Exported as a library so the step scripts can drive it with different prompts.
// step-2-loop.js stays behind as the bare skeleton. Step 6 adds the safety cap.

import { client, MODEL } from "./client.js";
import { toolDefinitions, toolImplementations } from "./tools.js";

// A response can hold more than one text block, and text can sit alongside a tool_use block.
// Collecting every text block is more robust than reaching for content[0].text.
function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function printHistory(messages) {
  console.log(`\nconversation history now holds ${messages.length} messages:`);
  for (const [i, message] of messages.entries()) {
    const shape = Array.isArray(message.content)
      ? message.content.map((block) => block.type).join(", ")
      : "text";
    console.log(`  [${i}] ${message.role.padEnd(9)} ${shape}`);
  }
}

// A safety bound, NOT the stopping mechanism. Healthy runs end via stop_reason long before this
// is reached. Hitting it is a bug signal — a tool that never satisfies the model, or a task the
// model cannot close out — so it is logged as a warning, not treated as a normal exit.
export const MAX_ITERATIONS = 20;

// `onEvent` is an optional listener. The CLI ignores it; the web UI in server.js uses it to
// stream the loop live. The console output below stays either way, so the terminal behaviour
// of every step script is unchanged.
export async function runAgent(userPrompt, { maxIterations = MAX_ITERATIONS, onEvent } = {}) {
  const emit = (event) => onEvent?.(event);

  console.log(`\n${"=".repeat(70)}\nUSER: ${userPrompt}\n${"=".repeat(70)}`);
  emit({ type: "start", prompt: userPrompt, maxIterations, model: MODEL });

  const messages = [{ role: "user", content: userPrompt }];
  let iteration = 0;
  let toolCallCount = 0;
  let finalAnswer = null;
  const usage = { input_tokens: 0, output_tokens: 0 };

  // The loop condition stays `true` on purpose: stop_reason is what ends this loop.
  // The cap below is a guard rail placed inside it, deliberately not the exit condition —
  // writing `while (iteration < maxIterations)` would make the cap look like the mechanism.
  while (true) {
    if (iteration >= maxIterations) {
      console.warn(
        `\n  WARNING: safety cap of ${maxIterations} iterations reached — aborting.\n` +
          "  This is not a normal exit. A healthy run ends on stop_reason === 'end_turn'.\n" +
          "  Investigate: a tool that never satisfies the model, or an unclosable task."
      );
      emit({ type: "cap", maxIterations });
      break;
    }

    iteration++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: toolDefinitions,
      messages,
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    console.log(`\niteration ${iteration} -> stop_reason: ${response.stop_reason}`);
    emit({
      type: "iteration",
      n: iteration,
      stopReason: response.stop_reason,
      // The block types of this response — the UI shows them because they are NOT stable
      // between runs, which is exactly why stop_reason is the signal and content is not.
      blockTypes: response.content.map((block) => block.type),
    });

    if (response.stop_reason === "tool_use") {
      // 1. The assistant turn goes into the history exactly as received, tool_use blocks
      //    included. Drop it and the tool_result below has nothing to pair with — the API
      //    rejects a tool_result whose tool_use_id it never saw.
      messages.push({ role: "assistant", content: response.content });

      // 2. One response can contain several tool_use blocks. Every single one must be
      //    answered, and all answers go into ONE user message.
      const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
      const toolResults = [];

      for (const block of toolUseBlocks) {
        toolCallCount++;
        console.log(`  run: ${block.name}(${JSON.stringify(block.input)})`);

        try {
          const result = toolImplementations[block.name](block.input);
          console.log(`  ->  ${JSON.stringify(result)}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id, // the id pairs this result with its request
            content: JSON.stringify(result), // must be a string, never a raw object
          });
          emit({ type: "tool", name: block.name, input: block.input, result, isError: false });
        } catch (error) {
          // A failing tool is a result, not a crash. Reporting it back with is_error lets
          // the model react — retry, pick another tool, or tell the user.
          console.log(`  ->  error: ${error.message}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${error.message}`,
            is_error: true,
          });
          emit({
            type: "tool",
            name: block.name,
            input: block.input,
            result: `Error: ${error.message}`,
            isError: true,
          });
        }
      }

      // 3. Tool results are sent back in the *user* role. That is the API's convention:
      //    the caller is speaking, reporting what the tools returned.
      messages.push({ role: "user", content: toolResults });

      continue; // back to the top — the model now sees the results and decides what is next
    }

    if (response.stop_reason === "end_turn") {
      // The task is done. Keep the closing turn in the history too, so the conversation
      // stays complete and could be continued later.
      messages.push({ role: "assistant", content: response.content });
      finalAnswer = extractText(response);
      console.log("  end_turn — task complete, returning the answer.");
      emit({ type: "answer", text: finalAnswer });
      break;
    }

    // max_tokens, refusal, pause_turn — each is its own case and none of them mean "done".
    // Falling through silently would be a bug, so make it loud and return nothing.
    console.log(`  Unhandled stop_reason: ${response.stop_reason}. Leaving the loop.`);
    emit({ type: "unhandled", stopReason: response.stop_reason });
    break;
  }

  console.log(`\nloop summary: ${iteration} iterations, ${toolCallCount} tool calls`);
  printHistory(messages);

  emit({
    type: "done",
    iterations: iteration,
    toolCalls: toolCallCount,
    usage,
    history: messages.map((message) => ({
      role: message.role,
      blocks: Array.isArray(message.content)
        ? message.content.map((block) => block.type)
        : ["text"],
    })),
  });

  return finalAnswer;
}
