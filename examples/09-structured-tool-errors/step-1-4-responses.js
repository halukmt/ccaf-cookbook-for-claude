// Free: real tool calls to the stdio server. Verifies every response shape, and how the SDK itself
// reports failures that the tool's own code did not structure.

import { check, finishChecks } from "../../_shared/check.js";
import { connectCustomerDb } from "./mcp-connection.js";
import { readMetadata } from "./recovery.js";

const db = await connectCustomerDb();
const call = (mode, identifier = "anna.weber@example.com") =>
  db.callTool({ name: "customer_lookup", arguments: { identifier, mode } });
const parse = (result) => JSON.parse(result.content[0].text);

const { tools } = await db.listTools();
check("Step 1: the server runs and publishes customer_lookup", tools.length === 1 && tools[0].name === "customer_lookup");
check("Step 1: mode is an enum on the tool's schema", tools[0].inputSchema.properties.mode.enum?.includes("timeout"));

const success = await call("success");
check("A real lookup returns the fixture customer", parse(success).customer?.id === "C-1001", success.content[0].text);

const expected = {
  timeout: ["transient", true],
  invalid: ["validation", true],
  business: ["business", false],
  permission: ["permission", false],
};
for (const [mode, [category, retryable]] of Object.entries(expected)) {
  const result = await call(mode);
  const data = parse(result);
  console.log(`\n${mode}:`, result.isError, data);
  check(`${mode}: isError is true`, result.isError === true);
  check(`${mode}: category ${category}, isRetryable ${retryable}`, data.errorCategory === category && data.isRetryable === retryable);
  check(`${mode}: exactly the three metadata fields`, Object.keys(data).sort().join() === "description,errorCategory,isRetryable");
  check(`${mode}: description is a real sentence`, typeof data.description === "string" && data.description.split(" ").length > 6);
}

const empty = await call("not_found");
const timeout = await call("timeout");
console.log("\nEmpty result:  ", empty);
console.log("Access failure:", timeout);
check("Empty result: isError is false, not absent", empty.isError === false);
check("Empty result: resultCount 0 and it says the query ran", parse(empty).resultCount === 0 && /executed successfully/.test(parse(empty).message));
check("Access failure says the query did not run", timeout.isError === true && /did not execute/.test(parse(timeout).description));
const realEmpty = await call("success", "nobody@example.com");
check("A real miss in the data also returns the empty shape", realEmpty.isError === false && parse(realEmpty).resultCount === 0);
const realInvalid = await call("success", "1001");
check("A real bad format also returns a validation error", realInvalid.isError === true && parse(realInvalid).errorCategory === "validation");

// What arrives when the tool's own code gives no structure. Each is reported, then checked.
const crash = await call("crash");
console.log("\nHandler threw:", crash);
check("A thrown exception comes back as isError, without metadata", crash.isError === true && readMetadata(crash) === null);

const badEnum = await db.callTool({ name: "customer_lookup", arguments: { identifier: "x", mode: "nonsense" } }).then(
  (result) => ({ kind: "result", isError: result.isError, text: result.content[0].text }),
  (error) => ({ kind: "protocol error", code: error.code, text: error.message })
);
console.log("Schema-invalid arguments:", badEnum);
check("SDK 1.30.0: schema-invalid arguments are an isError result, with the JSON-RPC code in its text", badEnum.kind === "result" && badEnum.isError === true && badEnum.text.includes("-32602"));
check("That result carries no metadata, so recovery treats it as unclassified", readMetadata({ content: [{ text: badEnum.text }] }) === null);

const unknownTool = await db.callTool({ name: "no_such_tool", arguments: {} }).then(
  (result) => ({ kind: "result", isError: result.isError, text: result.content[0].text }),
  (error) => ({ kind: "protocol error", code: error.code, text: error.message })
);
console.log("Unknown tool:", unknownTool);
check("SDK 1.30.0: an unknown tool is also an isError result, not a thrown protocol error", unknownTool.kind === "result" && unknownTool.isError === true && unknownTool.text.includes("-32602"));

await db.close();
finishChecks();
