// Adapter between the central server and the refactor lab. Works on a temp copy of the fixture.

import { createRefactorWorkspace, judgeRun, runRefactor, TASK, TOOLS } from "./refactor-lab.js";

const short = (input) => {
  const { file_path: path, ...rest } = input;
  return path ? { file: String(path).split(/[\\/]/).pop(), ...rest } : input;
};

export async function run(_params, emit) {
  emit({ type: "section", title: "The task", text: `Tools offered: ${TOOLS}. Fixture: a temp copy.` });
  emit({ type: "card", title: "Prompt", tone: "muted", text: TASK });

  const workspace = createRefactorWorkspace();
  const result = await runRefactor(workspace);

  emit({ type: "section", title: "Tool calls, in order", text: "Read from the CLI's real output stream. The red one is the non-unique Edit." });
  for (const call of result.toolCalls) {
    emit({ type: "tool", name: call.name, input: short(call.input), result: (call.resultText ?? "").slice(0, 500), isError: call.isError });
  }

  emit({ type: "section", title: "Checks", text: "From the tool calls, the files, and by running the migrated code." });
  for (const [label, pass, detail] of judgeRun(result.toolCalls, workspace.work)) {
    emit({ type: "check", label, pass, detail: String(detail).slice(0, 300) });
  }
  emit({ type: "check", label: "Isolation held: private instructions were not sent", pass: result.isolation.requests > 0 && !result.isolation.privateInstructionsSent });
  emit({ type: "card", title: "Answer", tone: "good", text: result.text });
  emit({
    type: "summary",
    items: [
      [result.toolCalls.length, "tool calls"],
      [result.toolCalls.filter((c) => c.name === "Edit").length, "Edit calls"],
      [result.toolCalls.filter((c) => c.isError).length, "failed calls"],
      [`$${result.costUsd.toFixed(4)}`, "cost reported by the CLI"],
    ],
  });
}
