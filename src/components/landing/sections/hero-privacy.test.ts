import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "hero.tsx"),
  "utf8",
);

test("Homepage bezeichnet den synthetischen Demoanruf ehrlich", () => {
  assert.match(source, /Testen Sie Silvia direkt hier\./);
  assert.match(source, /label="Marin anhören"/);
  assert.match(source, /Vorbereitete GPT-Live-1-Aufnahme mit Marin/);
  assert.match(source, /erst nach\s+Freigabe verfügbar/);
  assert.doesNotMatch(source, /Telefon (darunter|da rechts) ist echt/);
});
