// Live results are kept as fixed files, so the comparison can be re-read at no cost.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "results");

export function saveResult(name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(data, null, 2));
}

export function loadResult(name) {
  const file = resolve(dir, `${name}.json`);
  if (!existsSync(file)) throw new Error(`Missing results/${name}.json. Run the step that produces it first.`);
  return JSON.parse(readFileSync(file, "utf8"));
}
