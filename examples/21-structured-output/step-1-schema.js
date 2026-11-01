// Step 1: the schema itself, checked without a model.

import { check, finishChecks } from "../../_shared/check.js";
import { CATEGORIES, OPTIONAL_FIELDS, extractTool, strictSchema, validateInput } from "./tools.js";

const schema = extractTool.input_schema;
console.log(JSON.stringify(extractTool, null, 2));

check("Exactly three required fields", schema.required.length === 3, schema.required.join(", "));
check("The three optional fields are nullable", OPTIONAL_FIELDS.every((f) => schema.properties[f].type.includes("null")));
check("No nullable field is required", !schema.required.some((f) => OPTIONAL_FIELDS.includes(f)));
check("The enum has unclear and other", CATEGORIES.includes("unclear") && CATEGORIES.includes("other"));
check("There is a detail field for other", /other/.test(schema.properties.category_detail.description));
check("A strict schema lists every property as required", Object.keys(strictSchema.properties).every((f) => strictSchema.required.includes(f)));
check("A strict schema forbids extra properties", strictSchema.additionalProperties === false);

const good = { invoice_number: "1", vendor_name: "A", document_date: "2024-01-01", tax_id: null, category: "invoice" };
check("The validator accepts a good input", validateInput(schema, good).length === 0);
check("The validator can say no: missing field", validateInput(schema, { vendor_name: "A" }).length > 0);
check("The validator can say no: bad enum value", validateInput(schema, { ...good, category: "memo" }).length === 1);
check("The validator can say no: null where it is not allowed", validateInput(schema, { ...good, vendor_name: null }).length === 1);
finishChecks();
