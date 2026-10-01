import { test } from "node:test";
import assert from "node:assert/strict";
import { trainedGreetingFromFacts } from "./trained-greeting.ts";

test("nimmt die ausdruecklich trainierte Begruessung aus dem Schulungsbeispiel", () => {
  assert.equal(
    trainedGreetingFromFacts([
      "Mittwoch nur Kastrationen.",
      "Bei der Begrüßung sagen Sie: Grüß Gott, Tierordination Huber.",
    ]),
    "Grüß Gott, Tierordination Huber.",
  );
});

test("nimmt bei Store-Reihenfolge die neueste gueltige Begruessung", () => {
  assert.equal(
    trainedGreetingFromFacts([
      "Bei der Begrüßung sagen Sie: Grüß Gott, Ordination Neu.",
      "Bei der Begrüßung sagen Sie: Grüß Gott, Ordination Alt.",
    ]),
    "Grüß Gott, Ordination Neu.",
  );
});

test("eine geaenderte Regel gilt anstelle der vorherigen", () => {
  assert.equal(
    trainedGreetingFromFacts([
      "Bei der Begrüßung sagen Sie: Servus, Ordination Mayer.",
    ]),
    "Servus, Ordination Mayer.",
  );
});

test("ignoriert leere und ueberlange Regeln und faellt sicher zurueck", () => {
  const tooLong = `Bei der Begrüßung sagen Sie: ${"x".repeat(241)}`;
  assert.equal(
    trainedGreetingFromFacts([
      tooLong,
      "Bei der Begrüßung sagen Sie:   ",
      "Keine neuen Katzen vor 14:30.",
    ]),
    null,
  );
});

test("macht aus beliebigem Praxiswissen keine Begruessung", () => {
  assert.equal(
    trainedGreetingFromFacts([
      "Die Begrüßung soll freundlich sein.",
      "Sagen Sie am Telefon Grüß Gott.",
      "Parken hinter dem Haus.",
    ]),
    null,
  );
});
