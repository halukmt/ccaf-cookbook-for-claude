import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate } from "../dates/format-date.js";

// Happy path
test("formats an ISO date", () => assert.equal(formatDate("2024-01-15"), "15 January 2024"));
test("does not pad the day", () => assert.equal(formatDate("2024-03-05"), "5 March 2024"));
test("accepts a Date object", () => assert.equal(formatDate(new Date("2024-12-31T00:00:00Z")), "31 December 2024"));
// Edge cases
test("null gives Unknown date", () => assert.equal(formatDate(null), "Unknown date"));
test("undefined gives Unknown date", () => assert.equal(formatDate(undefined), "Unknown date"));
test("empty string gives Unknown date", () => assert.equal(formatDate(""), "Unknown date"));
test("a leap day works", () => assert.equal(formatDate("2024-02-29"), "29 February 2024"));
test("timezone must not shift the day at midnight UTC", () => assert.equal(formatDate("2024-01-01T00:00:00Z"), "1 January 2024"));
// Error cases
test("rejects a non-date string", () => assert.throws(() => formatDate("not-a-date"), /Invalid date format/));
test("rejects an impossible date rather than rolling over", () => assert.throws(() => formatDate("2023-02-29"), /Invalid date format/));
test("rejects a number", () => assert.throws(() => formatDate(20240115), /Invalid date format/));
