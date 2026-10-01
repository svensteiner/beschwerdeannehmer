import assert from "node:assert/strict";
import { test } from "node:test";
import { ASK_CLIENT_TIMEOUT_MS, buildSystem, isConfirmedAppointmentCorrection, localActionAfterBookingFailure, localActionWhileBookingPending, localReply, trainingModeAllowed } from "./ask-alma.ts";
import { demoDesk } from "./desk.ts";
import { identificationPrompt } from "./identify.ts";
import { PATIENTS } from "./patients.ts";

const desk = demoDesk();

test("clientseitige Gesprächsdeadline ist vom Server-Providerlimit getrennt", () => {
  assert.equal(ASK_CLIENT_TIMEOUT_MS, 35_000);
});

test("Schulung braucht Demo oder eine angemeldete Ordination", () => {
  assert.equal(trainingModeAllowed({ requested: true, demo: false, authenticated: false, inbound: false }), false);
  assert.equal(trainingModeAllowed({ requested: true, demo: true, authenticated: false, inbound: false }), true);
  assert.equal(trainingModeAllowed({ requested: true, demo: false, authenticated: true, inbound: false }), true);
  assert.equal(trainingModeAllowed({ requested: true, demo: false, authenticated: true, inbound: true }), false);
});

test("nach bestaetigtem Termin werden Datums-/Zeitangaben als Korrektur erkannt", () => {
  assert.equal(isConfirmedAppointmentCorrection("morgen statt heute"), true);
  assert.equal(isConfirmedAppointmentCorrection("bitte um 15 Uhr"), true);
  assert.equal(isConfirmedAppointmentCorrection("Hund zittert um 15 Uhr"), false);
  assert.equal(isConfirmedAppointmentCorrection("bitte um 99 Uhr"), false);
  assert.equal(isConfirmedAppointmentCorrection("ja, passt"), false);
  assert.equal(isConfirmedAppointmentCorrection("Wie sind morgen eure Öffnungszeiten?"), false);
  assert.equal(isConfirmedAppointmentCorrection("Mein Hund hat heute einen Notfall"), false);
  assert.equal(isConfirmedAppointmentCorrection("Den Termin morgen bitte absagen"), false);
  assert.equal(isConfirmedAppointmentCorrection("Mein Hund frisst seit heute nichts"), false);
  assert.equal(isConfirmedAppointmentCorrection("Ich brauche morgen einen Rückruf"), false);
  assert.equal(isConfirmedAppointmentCorrection("Meine Adresse morgen ist anders"), false);
  assert.equal(isConfirmedAppointmentCorrection("Neuer Termin morgen bitte"), false);
});

test("failed connector booking is explicitly local and not booked", () => {
  const action = localActionAfterBookingFailure({
    type: "book", owner: "Frau Test", pet: "Bella", kind: "Termin", concern: "", summary: "",
  }, "2099-01-01T10:00:00");
  assert.equal(action.type, "none");
  assert.equal(action.connectorApplied, false);
  assert.equal(action.summary, "Nicht eingetragen");
});

test("uncertain connector booking is not presented as successful", () => {
  const action = localActionAfterBookingFailure(
    { type: "book", owner: "Frau Test", pet: "Bella", kind: "Termin", concern: "", summary: "Vorschlag" },
    "2026-09-12T10:00:00+02:00",
    true,
  );
  assert.equal(action.type, "none");
  assert.equal(action.connectorApplied, false);
  assert.equal(action.summary, "Buchung nicht bestätigt");
});

test("pending connector booking merges as type none", () => {
  const action = localActionWhileBookingPending({
    type: "book", owner: "Frau Test", pet: "Bella", kind: "Termin", concern: "", summary: "Vorschlag",
  });
  assert.equal(action.type, "none");
  assert.equal(action.summary, "Buchung wird verarbeitet");
  assert.equal(action.connectorApplied, false);
});

test("Datenabgleich gate: pet question without identification returns the identification prompt, no record", () => {
  const result = localReply(
    "Wie geht's dem Kater Fritz?",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "",
  );
  assert.equal(result.text, identificationPrompt());
  assert.doesNotMatch(result.text, /Transportbox/);
  assert.doesNotMatch(result.text, /Berger/);
  assert.equal(result.action.type, "none");
  assert.equal(result.action.kind, "Datenabgleich");
});

test("Datenabgleich gate: once identified via a prior turn, the record comes through", () => {
  const result = localReply(
    "Wie geht's dem Kater Fritz?",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "Hier spricht Frau Berger, Lange Gasse 8.",
  );
  assert.match(result.text, /Transportbox/);
  assert.equal(result.action.owner, "Mag. Eva Berger");
  assert.equal(result.action.pet, "Fritz");
});

test("Datenabgleich gate: identified caller gets a one-time confirmation", () => {
  const result = localReply(
    "Ich bin Frau Berger, Lange Gasse 8, ich möchte einen Termin für den Kater Fritz.",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "",
  );
  assert.match(result.text, /^Danke, Frau Berger, ich hab Sie\. /);
});

test("Datenabgleich gate: emergency bypasses identification entirely", () => {
  const result = localReply(
    "Mein Hund hat einen Krampfanfall!",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "",
  );
  assert.equal(result.action.type, "emergency");
  assert.match(result.text, /Nachtdienst/);
  assert.doesNotMatch(result.text, /Datenabgleich/);
});

test("Datenabgleich gate: general Auskunft (Öffnungszeiten) is answered without identification", () => {
  const result = localReply(
    "Wie sind eure Öffnungszeiten?",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "",
  );
  assert.notEqual(result.text, identificationPrompt());
  assert.doesNotMatch(result.text, /Datenabgleich/);
});

test("Kontaktantwort behauptet vor der Persistenz keine Aktenablage", () => {
  const handy = localReply(
    "Meine Handynummer ist 0664 123 45 67",
    [], "akte", desk, true, false, [], "",
  );
  assert.match(handy.text, /Handynummer erhalten/);
  assert.doesNotMatch(handy.text, /Akte|gespeichert|zugeordnet/i);
  assert.equal(handy.action.kind, "Handy");

  const mail = localReply(
    "Meine E-Mail ist test@example.com",
    [], "akte", desk, true, false, [], "",
  );
  assert.match(mail.text, /E-Mail-Adresse erhalten/);
  assert.doesNotMatch(mail.text, /Akte|gespeichert|zugeordnet/i);
  assert.equal(mail.action.kind, "E-Mail");

  const named = localReply(
    "Ich bin Frau Berger, meine Handynummer ist 0664 123 45 67",
    [], "akte", desk, true, false, [], "",
  );
  assert.match(named.text, /Handynummer erhalten/);
  assert.doesNotMatch(named.text, /Berger|0664|Akte|gespeichert|zugeordnet/i);
  assert.equal(named.action.owner, "Klientel Berger");
  assert.equal(named.action.kind, "Handy");
});

test("beobachteter STT-Satz bleibt Öffnungszeiten-Auskunft statt Buchung", () => {
  const expected = localReply("Wie sind die Öffnungszeiten?", [], "akte", desk, true, false, [], "");
  const observed = localReply("Wir sind die Öffnungszeiten.", [], "akte", desk, true, false, [], "");
  assert.equal(observed.action.type, "none");
  assert.equal(observed.action.kind, "Info");
  assert.equal(observed.text, expected.text);
});

test("verneinte Termin- und Rückrufwünsche lösen keine gegenteilige Aktion aus", () => {
  const callbackOnly = localReply(
    "Bitte keinen Termin buchen, nur zurückrufen.", [], "akte", desk, true, false, [], "",
  );
  assert.equal(callbackOnly.action.type, "none");
  assert.equal(callbackOnly.action.kind, "Rückruf");

  const hoursOnly = localReply(
    "Ich möchte keinen Rückruf, nur die Öffnungszeiten wissen.", [], "akte", desk, true, false, [], "",
  );
  assert.equal(hoursOnly.action.type, "none");
  assert.equal(hoursOnly.action.kind, "Info");
  assert.doesNotMatch(hoursOnly.text, /Rückrufzettel/i);

  assert.equal(
    localReply("Bitte einen Termin buchen.", [], "akte", desk, true, false, [], "").action.type,
    "book",
  );
  assert.equal(
    localReply("Ich habe noch keinen Termin und möchte einen buchen.", [], "akte", desk, true, false, [], "").action.type,
    "book",
  );
  assert.equal(
    localReply("Keinen Termin am Montag, sondern einen am Dienstag.", [], "akte", desk, true, false, [], "").action.type,
    "book",
  );
  assert.equal(
    localReply("Bitte rufen Sie mich zurück.", [], "akte", desk, true, false, [], "").action.kind,
    "Rückruf",
  );
});

test("Datenabgleich gate: a name+address that matches nobody is treated as a new contact, no record leaked", () => {
  const result = localReply(
    "Hier spricht Herr Mustermann, Musterstraße 1, 1010 Wien, wie geht's meiner Katze?",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    "",
  );
  assert.match(result.text, /noch nicht bei uns angelegt/);
  assert.match(result.text, /Um welches Tier geht es/);
  assert.doesNotMatch(result.text, /Berger|Transportbox/);
});

test("buildSystem: Datenabgleich offen keeps the Akte out of the prompt, even in Sonderedition Akte", () => {
  const prompt = buildSystem("akte", [], desk, true, { identified: false });
  assert.match(prompt, /Datenabgleich: offen/);
  assert.match(prompt, /DATENABGLEICH ist noch OFFEN/);
  assert.doesNotMatch(prompt, /Transportbox/);
  assert.doesNotMatch(prompt, /Mag\. Eva Berger/);
});

test("buildSystem: Datenabgleich erledigt shows the Akte again and names who is identified", () => {
  const prompt = buildSystem("akte", [], desk, true, {
    identified: true,
    identifiedOwner: "Mag. Eva Berger",
  });
  assert.match(prompt, /Datenabgleich: erledigt \(Frau Berger\)/);
  assert.match(prompt, /Transportbox/);
});

test("buildSystem: fixed Ablauf and the Notfall-bypass rule are always stated", () => {
  const prompt = buildSystem("standard", [], desk, true, { identified: false });
  assert.match(
    prompt,
    /Begrüßung → Datenabgleich → Anliegen → Akte\/Termin → Zusammenfassung/,
  );
  assert.match(prompt, /Notfall sofort weiterverbinden/);
});

test("buildSystem: Wissenstraining bleibt kompakt und ohne Anrufdaten", () => {
  const prompt = buildSystem("akte", [], desk, true, {
    train: true,
    facts: ["Leopoldsgasse wird als Adresse verstanden."],
    behavior: "Immer freundlich und knapp antworten.",
  });
  assert.match(prompt, /Tierordination Huber/);
  assert.match(prompt, /Leopoldsgasse wird als Adresse verstanden/);
  assert.match(prompt, /freundlich und knapp/);
  assert.match(prompt, /Vertrauliche Daten bleiben lokal/);
  assert.match(prompt, /keine JSON-Daten/);
  assert.match(prompt, /Möchten Sie dazu noch etwas festlegen/);
  assert.doesNotMatch(prompt, /<<ACTION/);
  assert.doesNotMatch(prompt, /Patientenakte|Datenabgleich|Notfall|Termin|Nachtdienst/);
});

test("buildSystem: Wissenstraining enthält keine Patientenakte", () => {
  const prompt = buildSystem("akte", [PATIENTS[0]], desk, false, { train: true });
  assert.doesNotMatch(prompt, /Wastl|Lerchenfelder Straße|040098100123456/);
});
