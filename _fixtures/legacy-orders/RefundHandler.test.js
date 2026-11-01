import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRefund } from "./RefundHandler.js";

test("handleRefund marks a full refund", async () => {
  assert.equal((await handleRefund("ORD-3")).refund, "full");
});
