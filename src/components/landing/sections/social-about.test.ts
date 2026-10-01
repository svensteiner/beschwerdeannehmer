import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Social zeigt klar markierte Beispielszenarien statt Kundenstimmen", () => {
  const source = readFileSync(new URL("./social-about.tsx", import.meta.url), "utf8");
  assert.match(source, /Beispielszenarien für Ihre Ordination/);
  assert.match(source, /Außerhalb der Öffnungszeiten/);
  assert.match(source, /Rückrufwunsch/);
  assert.match(source, /Terminwunsch/);
  assert.doesNotMatch(source, /TESTIMONIALS|Ordinationen in allen neun|Dr\. med\. vet\.|„/);
});

test("Homepage behauptet keine unbelegte Messung", () => {
  const stats = readFileSync(new URL("./stats-problem.tsx", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../landing-shared.tsx", import.meta.url), "utf8");
  const data = readFileSync(new URL("../../../lib/alma/data.ts", import.meta.url), "utf8");
  const publicStats = data.match(/export const STATS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(publicStats, "Homepage-Kennzahlen müssen geprüft werden");
  assert.doesNotMatch(`${stats}\n${shared}\n${publicStats}`, /92\s*%|Eigene Messung|14 Ordinationen|Jänner bis Juni 2026/);
});
