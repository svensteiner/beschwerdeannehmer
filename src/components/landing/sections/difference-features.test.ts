import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Difference bleibt neutral und nennt Einsatzprüfung", () => {
  const component = readFileSync(new URL("./difference-features.tsx", import.meta.url), "utf8");
  const data = readFileSync(new URL("../../../lib/alma/data.ts", import.meta.url), "utf8");
  assert.match(component, /Für die Abläufe Ihrer Ordination/);
  assert.match(component, /Vor dem Einsatz klären/);
  assert.doesNotMatch(component, /Typische DE-Tools|Nicht aus Deutschland importiert/);
  assert.doesNotMatch(data, /Dialekte versteht sie|Typische DE-Tools|Deutsche Feiertage|AGB nach deutschem Recht/);
  assert.match(data, /Hörtest und Qualitätsprüfung vor dem Einsatz/);
  assert.match(data, /title: "Kanäle",\s*ours: "[^"]*WhatsApp/);
  assert.doesNotMatch(data, /Zwei Sprachen, ein Ton/);
});
