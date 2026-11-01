// Shared behaviour test. It passes before and after a migration: both functions process the order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkout } from "./CheckoutFlow.js";
import { invoiceAgain, invoiceOne } from "./InvoiceJob.js";
import { processIncoming } from "./OrderProcessor.js";
import { handleChargeback, handlePartialRefund, handleRefund } from "./RefundHandler.js";

for (const [name, run] of Object.entries({ checkout, invoiceAgain, invoiceOne, processIncoming, handleChargeback, handlePartialRefund, handleRefund })) {
  test(`${name} processes the order`, async () => {
    const result = await run("ORD-1");
    assert.equal(result.id, "ORD-1");
    assert.equal(result.status, "processed");
  });
}
