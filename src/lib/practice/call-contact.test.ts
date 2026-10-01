import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCallRow } from "./call-rows.ts";
import {
  akteCallerForCall,
  akteContactForCall,
  applyReachToEmergency,
  applyReachToRueckrufCall,
  applyReachToThread,
  callSpokenBlob,
  mergeSpokenReachIntoConcern,
  resolveOwnerEmail,
  resolveOwnerPhone,
} from "./call-contact.ts";

test("Rückruf without a pet still keeps the spoken Handy and E-Mail", () => {
  const blob = callSpokenBlob({
    concern: "Bitte unter 0664 123 45 67 zurückrufen, ich bin Frau Berger, berger@example.com",
    caller: "Frau Berger",
    transcript: [
      { from: "anrufer", text: "Bitte rufen Sie mich unter 0664 123 45 67 zurück" },
      { from: "alma", text: "Ich lege einen Rückrufzettel." },
    ],
  });
  assert.equal(resolveOwnerPhone("", blob), "06641234567");
  assert.equal(resolveOwnerEmail("", blob), "berger@example.com");
  assert.equal(resolveOwnerPhone("01 405 12 88", blob), "01 405 12 88");
  assert.equal(resolveOwnerEmail("nowak@example.com", blob), "nowak@example.com");
  assert.equal(resolveOwnerPhone("", "Kein Kontakt im Satz."), "");
  assert.equal(resolveOwnerEmail("", "Kein Kontakt im Satz."), "");
});

test("mapCallRow fills spoken Handy when the Akte join is empty", () => {
  const row = mapCallRow({
    id: "c1",
    at: "2026-08-26T08:00:00.000Z",
    channel: "telefon",
    caller: "Frau Berger",
    pet: "Patient",
    species: "",
    concern: "Bitte unter 0664 123 45 67 zurückrufen",
    status: "offen",
    duration_sec: 38,
    transcript: [
      { from: "anrufer", text: "Bitte rufen Sie mich unter 0664 123 45 67 zurück, berger@example.com", at: "2026-08-26T08:00:00.000Z" },
    ],
    action: "Rückrufzettel",
    owner_phone: "",
  });
  assert.equal(row.owner_phone, "06641234567");
  assert.equal(row.owner_email, "berger@example.com");
});

test("mapCallRow shows Termin gelegt for old Termin Termin gelegt rows", () => {
  const row = mapCallRow({
    id: "c2",
    at: "2026-08-29T03:00:00.000Z",
    channel: "telefon",
    caller: "Klientel",
    pet: "Resi",
    species: "",
    concern: "Termin für Resi",
    status: "offen",
    duration_sec: 38,
    transcript: [],
    action: "Termin Termin gelegt",
    owner_phone: "",
  });
  assert.equal(row.action, "Termin gelegt");
  assert.doesNotMatch(row.action, /Termin Termin/);
  const impfung = mapCallRow({
    ...row,
    duration_sec: row.durationSec,
    id: "c3",
    pet: "Nala",
    action: "Termin Impfung gelegt",
  });
  assert.equal(impfung.action, "Termin Impfung gelegt");
});

test("later Handy stays on the Rückrufzettel so Anrufe can dial", () => {
  assert.equal(mergeSpokenReachIntoConcern("Bitte zurückrufen", "0664 55 67 11", ""), "Bitte zurückrufen\n0664 55 67 11");
  assert.equal(
    mergeSpokenReachIntoConcern("Bitte unter 0664 55 67 11 zurückrufen", "0664 55 67 11", ""),
    "Bitte unter 0664 55 67 11 zurückrufen",
  );
  const next = applyReachToRueckrufCall({
    concern: "Bitte zurückrufen",
    caller: "Klientel",
    transcript: [
      { from: "anrufer", text: "Rufen Sie mich zurück, bitte.", at: "2026-08-29T08:00:00.000Z" },
      { from: "alma", text: "Ich lege einen Rückrufzettel.", at: "2026-08-29T08:00:01.000Z" },
    ],
    phone: "0664 55 67 11",
    email: "berger@example.com",
    owner: "",
    spoken: "Meine Nummer ist 0664 55 67 11.",
  });
  assert.equal(next.caller, "Klientel");
  assert.equal(
    applyReachToRueckrufCall({
      concern: "Bitte zurückrufen",
      caller: "Klientel",
      transcript: [],
      pet: "Patient",
      owner: "Klientel Anderwald",
      spoken: "Ich bin Frau Anderwald.",
    }).caller,
    "Klientel Anderwald",
  );
  assert.equal(
    applyReachToRueckrufCall({
      concern: "Bitte zurückrufen",
      caller: "Klientel",
      transcript: [],
      pet: "Nummer",
      phone: "0664 55 67 11",
    }).pet,
    "Patient",
  );
  assert.match(next.concern, /0664 55 67 11/);
  assert.match(next.concern, /berger@example.com/);
  assert.equal(next.transcript.at(-1)?.text, "Meine Nummer ist 0664 55 67 11.");
  const row = mapCallRow({
    id: "c4",
    at: "2026-08-29T08:00:00.000Z",
    channel: "telefon",
    caller: next.caller,
    pet: "Patient",
    species: "",
    concern: next.concern,
    status: "offen",
    duration_sec: 38,
    transcript: next.transcript,
    action: "Rückrufzettel",
    owner_phone: "",
  });
  assert.equal(row.owner_phone, "0664556711");
  assert.equal(row.owner_email, "berger@example.com");
});

test("Anrufe ignores a leftover Patient Akte and keeps the spoken E-Mail", () => {
  assert.equal(akteContactForCall("Patient", "0664 11 11 11"), "");
  assert.equal(akteContactForCall("Nummer", "stolen@example.com"), "");
  assert.equal(akteContactForCall("Nala", "0664 11 11 11"), "0664 11 11 11");
  assert.equal(akteCallerForCall("Patient", "Frau Stolen", "Klientel Spoken"), "Klientel Spoken");
  assert.equal(akteCallerForCall("Nala", "Frau Nowak", "Klientel"), "Frau Nowak");
  const named = mapCallRow({
    id: "c6",
    at: "2026-08-29T09:20:00.000Z",
    channel: "telefon",
    caller: "Frau Stolen",
    spoken_caller: "Klientel Spoken",
    pet: "Patient",
    species: "",
    concern: "Bitte zurückrufen",
    status: "offen",
    duration_sec: 38,
    transcript: [{ from: "anrufer", text: "Ich bin Frau Spoken.", at: "2026-08-29T09:20:00.000Z" }],
    action: "Rückrufzettel",
    owner_phone: "",
  });
  assert.equal(named.caller, "Klientel Spoken");
  assert.notEqual(named.caller, "Frau Stolen");
  const row = mapCallRow({
    id: "c5",
    at: "2026-08-29T08:40:00.000Z",
    channel: "telefon",
    caller: "Klientel",
    pet: "Patient",
    species: "",
    concern: "Bitte zurückrufen\nspoken.anrufe@example.com",
    status: "offen",
    duration_sec: 38,
    transcript: [{ from: "anrufer", text: "Meine E-Mail ist spoken.anrufe@example.com", at: "2026-08-29T08:40:00.000Z" }],
    action: "Rückrufzettel",
    owner_phone: "0664 11 11 11",
    owner_email: "stolen@example.com",
  });
  assert.equal(row.owner_phone, "");
  assert.equal(row.owner_email, "spoken.anrufe@example.com");
  assert.notEqual(row.owner_email, "stolen@example.com");
});

test("later Handy stays on the Notfall so Heute can dial", () => {
  const next = applyReachToEmergency({
    summary: "Katze hat Gift gefressen",
    owner_name: "Klientel",
    pet: "Patient",
    phone: "0664 55 69 45",
    email: "puntigam@example.com",
    owner: "Klientel Puntigam",
  });
  assert.equal(next.owner_name, "Klientel Puntigam");
  assert.equal(next.pet, "Patient");
  assert.match(next.summary, /0664 55 69 45/);
  assert.match(next.summary, /puntigam@example.com/);
  const withNight = applyReachToEmergency({
    summary: "Das klingt nach einem Notfall. Der Nachtdienst ist Nachtdienst unter 0316 38 23 36.",
    owner_name: "Klientel",
    pet: "Patient",
    phone: "0664 55 69 45",
    owner: "Klientel Puntigam",
  });
  assert.match(withNight.summary, /0664 55 69 45/);
  assert.match(withNight.summary, /0316 38 23 36/);
  assert.equal(
    applyReachToEmergency({
      summary: "Gift",
      owner_name: "Klientel",
      pet: "Nummer",
      phone: "0664 55 69 45",
    }).pet,
    "Patient",
  );
});

test("later Handy stays on the Klientel-Protokoll so Nachrichten can dial", () => {
  const next = applyReachToThread({
    name: "Klientel",
    preview: "Termin bestätigt: Patient",
    messages: [{ from: "alma", text: "Termin liegt.", at: "2026-08-29T09:50:00.000Z" }],
    pet: "Patient",
    phone: "0664 55 69 67",
    email: "leitgeb@example.com",
    owner: "Klientel Leitgeb",
    spoken: "Ich bin Frau Leitgeb. Meine Nummer ist 0664 55 69 67.",
  });
  assert.equal(next.name, "Klientel Leitgeb");
  assert.equal(next.pet, "Patient");
  assert.match(next.preview, /0664 55 69 67/);
  assert.match(next.preview, /leitgeb@example.com/);
  assert.equal(next.messages.at(-1)?.text, "Ich bin Frau Leitgeb. Meine Nummer ist 0664 55 69 67.");
});
