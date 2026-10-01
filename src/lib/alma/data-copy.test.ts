import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CALLS, EMERGENCIES, FAQ, FEATURES, LIVE_TRANSCRIPT } from "./data.ts";
import {
  HOME_PROTOKOLL_ANZEIGE_BODY,
  PREISE_FAQ_NACHT_ANZEIGE,
  homePublicFeatures,
} from "../practice/tafel-anzeige.ts";

test("Homepage copy verspricht weder konfigurierbare Notfallliste noch automatischen Nachtbetrieb", () => {
  const emergency = FAQ.find((item) => /Notfall falsch einordnet/.test(item.q));
  const night = FAQ.find((item) => /Nachtdienst/.test(item.q));
  assert.ok(emergency && night);
  assert.match(emergency.a, /noch nicht über die Oberfläche konfigurierbar/);
  assert.doesNotMatch(emergency.a, /selbst erweitern/);
  assert.match(emergency.a, /Notfall nicht erkannt/);
  assert.match(emergency.a, /keine automatische Alarmierung/);
  assert.doesNotMatch(night.a, /nimmt Silvia ab|Routine wird als Termin vorgemerkt/i);
  assert.match(night.a, /Terminwünsche auf der Praxistafel/);
  assert.match(night.a, /nicht automatisch versendet/);
  assert.doesNotMatch(PREISE_FAQ_NACHT_ANZEIGE, /nimmt Silvia ab/);
  assert.match(PREISE_FAQ_NACHT_ANZEIGE, /Gesprächs-Demo/);
});

test("Beide Homepage-Modi lassen Verschieben und Stornieren bei der Tierarzthelferin", () => {
  const callFeature = FEATURES[0];
  assert.ok(callFeature);
  assert.match(callFeature.title, /Demo/);
  for (const items of [homePublicFeatures([callFeature]), homePublicFeatures([callFeature], true)]) {
    const body = items[0]?.body ?? "";
    assert.match(body, /Tierarzthelferin/);
    assert.doesNotMatch(body, /Bucht, verschiebt, storniert|wirklich abhebt/);
  }
  assert.match(HOME_PROTOKOLL_ANZEIGE_BODY, /Tierarzthelferin/);
  assert.doesNotMatch(HOME_PROTOKOLL_ANZEIGE_BODY, /Sie bucht, verschiebt, storniert|wenn alle im OP sind/);
});

test("Demo-Notfall und -Anruf versprechen keine Verbindung, Kartei oder SMS", () => {
  const emergencyCall = CALLS.find((item) => item.id === "c3");
  assert.ok(emergencyCall);
  assert.doesNotMatch(emergencyCall.action ?? "", /verbunden/i);
  assert.doesNotMatch(emergencyCall.transcript.map((line) => line.text).join(" "), /verbinde|protokoll mit/i);
  assert.doesNotMatch(LIVE_TRANSCRIPT.map((line) => line.text).join(" "), /SMS/i);
  const appointmentCall = CALLS.find((item) => item.id === "c1");
  assert.ok(appointmentCall);
  assert.doesNotMatch(appointmentCall.transcript.map((line) => line.text).join(" "), /bekommen eine SMS/i);
  assert.ok(EMERGENCIES.some((item) => item.status === "neu"));
  assert.ok(EMERGENCIES.every((item) => item.status !== "verbunden"));

  const root = dirname(fileURLToPath(import.meta.url));
  const notfall = readFileSync(resolve(root, "../../routes/demo/notfall.tsx"), "utf8");
  const demoIndex = readFileSync(resolve(root, "../../routes/demo/index.tsx"), "utf8");
  assert.match(notfall, /Notfallhinweise/);
  assert.match(notfall, /Schlagworthinweis/);
  assert.match(notfall, /Hinterlegter Kontakt/);
  assert.match(notfall, /In der Demo als bearbeitet markiert/);
  assert.doesNotMatch(notfall, /verbindet\s+mit|Weitergeleitet an|Kartei dokumentiert/);
  assert.doesNotMatch(demoIndex, /Notfall verbunden/);
  assert.match(demoIndex, /Notfallhinweis/);
});
