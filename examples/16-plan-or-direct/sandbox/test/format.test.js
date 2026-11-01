import assert from "node:assert/strict";
import { test } from "node:test";
import { greeting } from "../src/api/public.js";

test("greets a signed-in user", () => {
  assert.equal(greeting({ user: { name: " Ada " } }), "Hello Ada");
});
test("greets an anonymous visitor as Guest", () => {
  assert.equal(greeting({}), "Hello Guest");
});
