// Free: starts the MCP server in-process and lists what it really publishes.

import { check, finishChecks } from "../../_shared/check.js";
import { publishedTools, RICH, VAGUE } from "./customer-tools-server.js";

const vague = await publishedTools(VAGUE);
const rich = await publishedTools(RICH);
console.log(JSON.stringify(vague.tools, null, 2));

const names = vague.tools.map((tool) => tool.name).sort();
check("The server publishes exactly the two tools", names.join() === "get_customer,lookup_order", names.join());
check("A tool call over MCP really reaches the handler", vague.echo.includes("result for probe"), vague.echo);
check(
  "Vague descriptions are one short sentence with no boundary",
  vague.tools.every((t) => t.description.split(" ").length <= 4 && !/do not/i.test(t.description))
);
check(
  "Vague identifier parameter has no description or format",
  vague.tools.every((t) => t.input_schema.properties.identifier.type === "string" && !t.input_schema.properties.identifier.description)
);
check(
  "Rich descriptions name the other tool, formats and examples",
  rich.tools.every((t) => {
    const other = t.name === "get_customer" ? "lookup_order" : "get_customer";
    return t.description.includes(`use ${other}`) && /#12345|user@domain\.com/.test(t.description) && /'[^']+\?'/.test(t.description);
  })
);
check(
  "Rich descriptions are 3 to 5 sentences",
  rich.tools.every((t) => {
    const sentences = t.description.split(/\.\s+|\.$/).filter(Boolean).length;
    return sentences >= 3 && sentences <= 5;
  })
);
check(
  "The required parameters are identical between the two versions",
  vague.tools.every((t, i) => t.input_schema.required.join() === rich.tools[i].input_schema.required.join())
);
finishChecks();
