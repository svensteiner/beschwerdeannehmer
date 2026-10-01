import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DATENSCHUTZ_STORE,
  DATENSCHUTZ_STORE_ANZEIGE,
  DATENSCHUTZ_WA,
  DESK_DATENSCHUTZ_ID,
  DESK_DATENSCHUTZ_STORE_ID,
  DESK_IMPRESSUM_ID,
  IMPRESSUM_SCOPE,
  PREISE_FAQ_WHATSAPP,
  datenschutzStore,
} from "./desk-legal.ts";

test("Datenschutz and Impressum do not sell a demo API", () => {
  assert.equal(DESK_DATENSCHUTZ_ID, "desk-datenschutz");
  assert.equal(DESK_DATENSCHUTZ_STORE_ID, "desk-datenschutz-store");
  assert.equal(DESK_IMPRESSUM_ID, "desk-impressum");
  assert.match(DATENSCHUTZ_WA, /wa\.me/);
  assert.match(DATENSCHUTZ_WA, /mailto:/);
  assert.doesNotMatch(DATENSCHUTZ_WA, /läuft über die offizielle Business-API/i);
  assert.match(DATENSCHUTZ_STORE, /Praxistafel/);
  assert.match(DATENSCHUTZ_STORE, /Postgres/);
  assert.doesNotMatch(DATENSCHUTZ_STORE, /Diese Demo speichert/);
  assert.match(IMPRESSUM_SCOPE, /keine tierärztliche Untersuchung/);
  assert.doesNotMatch(IMPRESSUM_SCOPE, /Inhalte dieser Demo/);
  assert.match(PREISE_FAQ_WHATSAPP, /Entwurf/);
  assert.doesNotMatch(PREISE_FAQ_WHATSAPP, /offiziellen WhatsApp-Business-API/i);
});

test("Anzeige Datenschutz does not claim this disk or a homepage demo", () => {
  assert.match(DATENSCHUTZ_STORE_ANZEIGE, /Schreib-Rechner/);
  assert.match(DATENSCHUTZ_STORE_ANZEIGE, /Kopie/);
  assert.doesNotMatch(DATENSCHUTZ_STORE_ANZEIGE, /auf diesem Rechner/);
  assert.doesNotMatch(DATENSCHUTZ_STORE_ANZEIGE, /Verkaufs-Demo auf der Startseite/);
  assert.equal(datenschutzStore(), DATENSCHUTZ_STORE);
  assert.equal(datenschutzStore(false), DATENSCHUTZ_STORE);
  assert.equal(datenschutzStore(true), DATENSCHUTZ_STORE_ANZEIGE);
});
