// Saved results for scripts that make paid calls. runOnce() keeps a re-run from spending money by
// accident: if the file exists it is read back, and a new paid run needs --force.
//
//   const store = resultStore(import.meta.url);
//   const data = await store.runOnce("vague", () => paidWork());

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resultStore(moduleUrl) {
  const dir = resolve(dirname(fileURLToPath(moduleUrl)), "results");
  const path = (name) => resolve(dir, `${name}.json`);

  const has = (name) => existsSync(path(name));
  const save = (name, data) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path(name), JSON.stringify(data, null, 2));
    return data;
  };
  const load = (name) => {
    if (!has(name)) throw new Error(`Missing results/${name}.json. Run the step that produces it first.`);
    return JSON.parse(readFileSync(path(name), "utf8"));
  };
  const runOnce = async (name, work) => {
    if (has(name) && !process.argv.includes("--force")) {
      console.log(`Using saved results/${name}.json, no API call. Pass --force for a new paid run.`);
      return load(name);
    }
    return save(name, await work());
  };
  return { has, save, load, runOnce };
}
