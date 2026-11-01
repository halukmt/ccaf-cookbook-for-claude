// Step 2 — The agentic loop.
//
// The loop structure and the stop_reason inspection are the whole point of this step.
// Both branches are deliberately left as stubs: actually executing the tool is step 3,
// extracting the final answer is step 4. Building them now would hide the loop this step is about.

import { check, finishChecks } from "../../_shared/check.js";
import { client, MODEL } from "./client.js";
import { toolDefinitions } from "./tools.js";

async function runLoop(userPrompt) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`USER: ${userPrompt}`);
  console.log("=".repeat(70));

  // The conversation is ours to keep. The API is stateless — every request carries the
  // full history, which is why this array lives outside the loop and grows inside it.
  const messages = [{ role: "user", content: userPrompt }];

  let iteration = 0;

  while (true) {
    iteration++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: toolDefinitions,
      messages,
    });

    // stop_reason is the model's own statement about why it stopped generating.
    // It is the authoritative signal for what the loop does next — not the text content,
    // not a keyword, not a guess.
    console.log(`\niteration ${iteration} -> stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === "tool_use") {
      const toolCall = response.content.find((block) => block.type === "tool_use");
      console.log(`  Claude requests: ${toolCall.name}(${JSON.stringify(toolCall.input)})`);
      console.log("  -> Execute it, append the result, keep looping. That is step 3.");
      return { branch: "tool_use", toolName: toolCall.name }; // TODO(step 3): run the tool and continue.
    }

    if (response.stop_reason === "end_turn") {
      console.log("  Claude answered without needing a tool.");
      console.log("  -> Extract the final text and return it. That is step 4.");
      return { branch: "end_turn" }; // TODO(step 4): return the final text.
    }

    // Anything else — max_tokens, refusal, pause_turn — is its own case.
    // Falling through silently would be a bug, so make it loud.
    console.log(`  Unhandled stop_reason: ${response.stop_reason}. Leaving the loop.`);
    return { branch: "unhandled", stopReason: response.stop_reason };
  }
}

// Two prompts, so both branches of the stop_reason check actually fire.
const withTool = await runLoop("What is 17 * 23?");
const withoutTool = await runLoop("Say hello in exactly one word.");

console.log("");
check("A prompt that needs a tool takes the tool_use branch", withTool.branch === "tool_use", withTool.branch);
check("That branch names a real tool", toolDefinitions.some((t) => t.name === withTool.toolName), withTool.toolName);
check("A prompt that needs no tool takes the end_turn branch", withoutTool.branch === "end_turn", withoutTool.branch);
finishChecks();
