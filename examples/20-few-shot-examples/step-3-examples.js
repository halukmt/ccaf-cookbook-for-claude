// Step 3: three few-shot examples, each with reasoning, checked without a model.

import { check, finishChecks } from "../../_shared/check.js";
import { documentText, lineItemSum } from "../../_fixtures/documents-answers.js";
import { FEW_SHOT_EXAMPLES, TEST_DOCS, fewShotPrompt } from "./extract.js";

check("Three examples", FEW_SHOT_EXAMPLES.length === 3);
check("They cover table, narrative and mixed", new Set(FEW_SHOT_EXAMPLES.map((e) => e.structure)).size === 3);
for (const example of FEW_SHOT_EXAMPLES) {
  check(`${example.structure}: has input, output and real reasoning`, example.input && example.output && example.reasoning.length > 80);
  check(`${example.structure}: its own line items add up to its total`, lineItemSum(example.output.line_items) === example.output.total_amount);
  check(`${example.structure}: not copied from the test set`, !TEST_DOCS.some((doc) => documentText(doc).includes(example.input.slice(0, 40))));
}
check("At least one example shows null instead of a guess", FEW_SHOT_EXAMPLES.some((e) => Object.values(e.output).includes(null)));
check("The rendered prompt carries each reasoning", FEW_SHOT_EXAMPLES.every((e) => fewShotPrompt().includes(e.reasoning)));
finishChecks();
