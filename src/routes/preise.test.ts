import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Silvia-Live-FAQ beschreibt die gesperrte Hörprobe ehrlich", async () => {
  const source = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), "preise.tsx"),
    "utf8",
  );

  assert.match(source, /separate GPT-Live-1-Demo mit Marin/);
  assert.match(source, /nur nach ausdrücklicher Freigabe mit erfundenen Inhalten/);
  assert.doesNotMatch(source, /Eine öffentliche interaktive Live-Demo gibt es noch nicht/);
});
