import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

test("browsernahe Praxis-Module enthalten keinen direkten Datenbankimport", () => {
  for (const file of ["profile.ts", "facts.ts"]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /db\.server/);
  }
});
