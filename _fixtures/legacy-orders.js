// Access to the legacy-orders fixture: a deprecated function reached directly, through a barrel file and
// through a wrapper. Read-only for examples. Anything that edits files must work on copyLegacyOrders().

import { createHash } from "node:crypto";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_ORDERS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "legacy-orders");

export function copyLegacyOrders(target) {
  cpSync(LEGACY_ORDERS_DIR, target, { recursive: true });
}

export function hashDirectory(dir) {
  const hash = createHash("sha256");
  for (const name of readdirSync(dir).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(dir, name)));
  }
  return hash.digest("hex");
}

export const DECOY_FILES = ["shipping.js", "tax.js", "emails.js"];
