import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));
const homepage = readFileSync(resolve(root, "call-scene.tsx"), "utf8");
const liveDemo = readFileSync(
  resolve(root, "../../sprechen/silvia-live-demo.tsx"),
  "utf8",
);

test("Homepage zeigt den sicheren Live-Hörtest einmal an", () => {
  assert.match(homepage, /import \{ SilviaLiveDemo \}/);
  assert.equal((homepage.match(/<SilviaLiveDemo \/>/g) ?? []).length, 1);
  assert.match(homepage, /label="Marin anhören"/);
  assert.match(homepage, /Vorbereitete GPT-Live-1-Aufnahme mit Marin · nicht interaktiv/);
  assert.match(liveDemo, /noch nicht freigegeben/);
  assert.doesNotMatch(liveDemo, /SILVIA_LIVE_DEMO_ENABLED=1 erforderlich/);
});

test("Produktfilm kennzeichnet Beispiele und behauptet keine echte Notdienstübergabe", () => {
  const film = readFileSync(resolve(root, "../product-film-scenes.ts"), "utf8");
  const landingData = readFileSync(resolve(root, "../landing-data.ts"), "utf8");
  assert.match(homepage, /erfundenen Beispieldaten/);
  assert.match(homepage, /Versandentwürfe/);
  assert.match(film, /Praxisanbindung nach Prüfung/);
  assert.match(film, /Hinweis auf den tierärztlichen Notdienst/);
  assert.doesNotMatch(film, /an die Vetmeduni übergeben|Praxissoftware angebunden|Feiertage wie im Gesetz/);
  assert.match(landingData, /Hinweis auf den tierärztlichen Notdienst/);
  assert.doesNotMatch(landingData, /an die Vetmeduni übergeben|Protokoll mitgeschickt/);
});

test("Homepage-Demo fragt bei sichtbarer Nummer und bekanntem Namen nur die Adresse", () => {
  assert.match(homepage, /Ihre Anrufernummer wird mir angezeigt/);
  assert.match(homepage, /nur noch Ihre Adresse/);
  assert.doesNotMatch(homepage, /Wie heißen Sie/);
});
