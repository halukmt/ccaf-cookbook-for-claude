import assert from "node:assert/strict";
import { test } from "node:test";
import { processIncoming } from "./OrderProcessor.js";

test("processIncoming sets the queue", async () => {
  assert.equal((await processIncoming("ORD-2")).queue, "incoming");
});
