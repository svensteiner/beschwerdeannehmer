import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Hörproben-Fußnote trennt Stimme und echtes Live-Gespräch", async () => {
  const source = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), "silvia-varianten.tsx"),
    "utf8",
  );
  assert.match(source, /vorbereitete Aufnahmen/);
  assert.match(source, /lokal erzeugten Stimme/);
  assert.match(source, /interaktives Unterbrechen gibt\s+es nur isoliert/);
  assert.match(source, /Eine neue Hörprobe beendet die vorherige Wiedergabe/);
  assert.match(source, /Die Live-Aufnahme mit\s+Marin zeigt\s+die separate GPT-Live-1-Demo/);
  assert.doesNotMatch(source, /Beide Aufnahmen nutzen Marin\./);
});
