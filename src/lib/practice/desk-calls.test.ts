import assert from "node:assert/strict";
import { test } from "node:test";
import { internPracticeInbox } from "../alma/phone.ts";
import {
  internDeskTitle,
  internDraftBody,
  internDraftDomIds,
  internSettingsTarget,
  isOpenDeskTicket,
  isOpenEmergency,
  liveLineInternDraft,
  marksReadOnOpen,
  openEmergencies,
  recentLogCalls,
  isLeftoverInternNoise,
  unreadInternCount,
  unreadInternThreads,
} from "./desk-calls.ts";

test("open Rückruf and Kassa tickets stay out of Letzte Gespräche", () => {
  const calls = [
    { id: "r1", status: "offen", action: "Rückrufzettel" },
    { id: "k1", status: "offen", action: "An die Kassa" },
    { id: "k2", status: "offen", action: "An die Tierarzthelferin" },
    { id: "b1", status: "offen", action: "Termin Impfung gelegt" },
    { id: "r2", status: "erledigt", action: "Rückrufzettel" },
  ];
  assert.equal(isOpenDeskTicket(calls[0]!), true);
  assert.equal(isOpenDeskTicket(calls[1]!), true);
  assert.equal(isOpenDeskTicket(calls[2]!), true);
  assert.equal(isOpenDeskTicket(calls[3]!), false);
  const log = recentLogCalls(calls);
  assert.deepEqual(
    log.map((c) => c.id),
    ["b1", "r2"],
  );
});

test("Heute intern queue is unread Frau-Doktor notes, not Halterin confirmations", () => {
  const threads = [
    { id: "c1", intern: false, unread: 0, pet: "Nala" },
    { id: "i1", intern: true, unread: 1, pet: "Zorro" },
    { id: "i0", intern: true, unread: 0, pet: "Ada" },
    { id: "i2", intern: true, unread: 2, pet: "Poldi" },
  ];
  assert.deepEqual(
    unreadInternThreads(threads).map((t) => t.id),
    ["i1", "i2"],
  );
  assert.equal(unreadInternCount(threads), 3);
  assert.equal(
    unreadInternCount([
      { intern: false, unread: 12, preview: "Walk-in gelegt" },
      { intern: true, unread: 1, preview: "Termin: Lissi · Frau Berger" },
      { intern: true, unread: 2, preview: "Auskunft hinterlegt" },
      { intern: true, unread: 3, preview: "Kontakt: Protokoll · Klientel" },
      { intern: true, unread: 1, preview: "Rückruf: Protokoll" },
    ]),
    2,
  );
  assert.equal(isLeftoverInternNoise({ intern: true, preview: "Auskunft hinterlegt" }), true);
  assert.equal(isLeftoverInternNoise({ intern: true, preview: "Kontakt: Protokoll · Klientel" }), true);
  assert.equal(isLeftoverInternNoise({ intern: true, preview: "Rückruf: Protokoll" }), false);
  assert.equal(isLeftoverInternNoise({ intern: true, preview: "Kontakt: Gschwandtner · Klientel Gschwandtner" }), false);
  assert.equal(isLeftoverInternNoise({ intern: false, preview: "Auskunft hinterlegt" }), false);
  assert.deepEqual(internDraftDomIds("heute-intern", "i1"), {
    tel: "heute-intern-i1-tel",
    wa: "heute-intern-i1-wa",
    sms: "heute-intern-i1-sms",
    mail: "heute-intern-i1-mail",
    settings: "heute-intern-i1-settings",
    gelesen: "heute-intern-i1-gelesen",
  });
  assert.notEqual(internDraftDomIds("heute-intern", "i1").wa, internDraftDomIds("heute-intern", "i2").wa);
  assert.deepEqual(internDraftDomIds("heute-intern", ""), {});
  assert.equal(JSON.stringify(internDraftDomIds("heute-intern", "i1")).includes("huber"), false);
  assert.equal(marksReadOnOpen({ intern: true }), false);
  assert.equal(marksReadOnOpen({ intern: false }), true);
});

test("intern desk title uses the Halterin when there is no Tier", () => {
  assert.equal(
    internDeskTitle({
      pet: "Zettel",
      name: "Dr. Quelle · intern",
      preview: "Rückruf: Zettel",
    }),
    "Zettel",
  );
  assert.equal(
    internDeskTitle({
      pet: "Patient",
      name: "Dr. Quelle · intern",
      preview: "Rückruf: Patient · Klientel Zettel",
    }),
    "Zettel",
  );
  assert.equal(
    internDeskTitle({
      pet: "Nala",
      name: "Dr. Quelle · intern",
      preview: "Termin: Nala · Frau Berger",
    }),
    "Nala",
  );
  assert.equal(
    internDeskTitle({ pet: "Protokoll", name: "Dr. Quelle · intern" }),
    "Dr. Quelle · intern",
  );
});

test("intern draft to Frau Doktor keeps the slot after a Kontakt follow-up", () => {
  const booking =
    "Protokoll Silvia · Tafel\nKanal: Kassa\nTier: Momo\nAktion: Kontrolle · Mittwoch, 26.8. um 08:00";
  const contact = "Kontakt nachgetragen für Momo.\nE-Mail: nowak@example.com";
  const body = internDraftBody([{ text: booking }, { text: contact }], "Kontakt: Momo · Frau Berger");
  assert.match(body, /08:00/);
  assert.match(body, /nowak@example.com/);
  assert.match(body, /Kanal: Kassa/);
  assert.equal(internDraftBody([], "Kontakt: Momo"), "Kontakt: Momo");
  assert.equal(internDraftBody([{ text: "eins" }, { text: "eins" }], ""), "eins");
});

test("live intern draft is wa.me / sms / mailto / tel to the practice, never the Halterin or Huber", () => {
  const booking =
    "Protokoll Silvia · Tafel\nKanal: Kassa\nTier: Lissi\nAktion: Impfung · Donnerstag, 27.8. um 15:00";
  const draft = liveLineInternDraft({
    id: "th-intern-1",
    pet: "Lissi",
    preview: "Protokoll: Lissi Impfung",
    body: internDraftBody([{ text: booking }], "Protokoll: Lissi Impfung"),
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "0664 12 34 56",
    practicePhone: "0316 99 88 77",
    practiceEmail: "kassa@ordination.at",
  });
  assert.ok(draft);
  assert.match(draft.href, /wa\.me\/43664123456/);
  assert.match(draft.smsHref, /^sms:\+43664123456/);
  assert.match(draft.mailHref, /^mailto:kassa@ordination\.at\?/);
  assert.equal(draft.telHref, "tel:+43664123456");
  assert.equal(draft.href.includes("43316998877"), false);
  assert.equal(draft.telHref.includes("43316998877"), false);
  assert.equal(draft.href.includes("4314051288"), false);
  assert.equal(draft.telHref.includes("4314051288"), false);
  assert.equal(draft.mailHref.includes("nowak@"), false);
  assert.equal(draft.mailHref.includes("rezeption@huber.vet"), false);
  const text = decodeURIComponent(draft.href.split("text=")[1] ?? "");
  assert.match(text, /Lissi/);
  assert.match(text, /15:00/);
  assert.match(text, /Kanal: Kassa/);
});

test("live intern WhatsApp stays empty on Festnetz — SMS still uses the Leitung", () => {
  const draft = liveLineInternDraft({
    id: "th-intern-festnetz",
    pet: "Lissi",
    preview: "Protokoll: Lissi",
    body: "Protokoll Silvia · Tafel\nTier: Lissi",
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "0316 12 34 56",
    practicePhone: "0316 12 34 56",
    practiceEmail: "kassa@ordination.at",
  });
  assert.ok(draft);
  assert.equal(draft.href, "");
  assert.match(draft.smsHref, /^sms:\+43316123456/);
  assert.equal(draft.telHref, "tel:+43316123456");
  assert.match(draft.mailHref, /^mailto:kassa@ordination\.at\?/);
  assert.equal(draft.telHref.includes("4314051288"), false);
});

test("intern mail stays empty when inbox is still Anmelden — no Kassa-Login mailto", () => {
  const email = internPracticeInbox("kassa@ordination.at", "Kassa@ordination.at");
  assert.equal(email, "");
  const draft = liveLineInternDraft({
    id: "th-intern-login",
    pet: "Lissi",
    preview: "Protokoll: Lissi",
    body: "Protokoll Silvia · Tafel\nTier: Lissi",
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "0664 12 34 56",
    practicePhone: "0316 99 88 77",
    practiceEmail: email,
  });
  assert.ok(draft);
  assert.equal(draft.mailHref, "");
  assert.match(draft.href, /wa\.me\/43664123456/);
});

test("intern settings link opens Inbox when mail is missing, not Leitung", () => {
  assert.deepEqual(
    internSettingsTarget({
      href: "https://wa.me/43664123456",
      mailHref: "",
      smsHref: "sms:+43664123456",
    }),
    { hash: "email", label: "E-Mail hinterlegen" },
  );
  assert.deepEqual(
    internSettingsTarget({
      href: "",
      mailHref: "mailto:rezeption@ordination.at?subject=Protokoll",
      smsHref: "sms:+43316123456",
    }),
    { hash: "whatsapp", label: "WhatsApp-Handy hinterlegen" },
  );
  assert.deepEqual(
    internSettingsTarget({
      href: "",
      mailHref: "",
      smsHref: "sms:+43316123456",
    }),
    { hash: "whatsapp", label: "WhatsApp-Handy hinterlegen" },
  );
  assert.deepEqual(internSettingsTarget({ href: "", mailHref: "", smsHref: "" }), {
    hash: "leitung",
    label: "Nummer und E-Mail hinterlegen",
  });
  assert.equal(
    internSettingsTarget({
      href: "https://wa.me/43664123456",
      mailHref: "mailto:rezeption@ordination.at?subject=Protokoll",
    }),
    null,
  );
  assert.notEqual(
    internSettingsTarget({ href: "https://wa.me/43664123456", mailHref: "" })?.hash,
    "leitung",
  );
});

test("live intern tel calls Frau Doktor, never the Halterin and never Huber", () => {
  const handy = liveLineInternDraft({
    id: "th-intern-tel-handy",
    pet: "Lissi",
    preview: "Protokoll: Lissi",
    body: "Protokoll Silvia · Tafel\nTier: Lissi",
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "0664 12 34 56",
    practicePhone: "0316 99 88 77",
    practiceEmail: "rezeption@ordination.at",
  });
  assert.ok(handy);
  assert.equal(handy.telHref, "tel:+43664123456");
  assert.equal(handy.telHref.includes("43316998877"), false);
  assert.equal(handy.telHref.includes("4314051288"), false);
  const fest = liveLineInternDraft({
    id: "th-intern-tel-fest",
    pet: "Lissi",
    preview: "Protokoll: Lissi",
    body: "Protokoll Silvia · Tafel\nTier: Lissi",
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "",
    practicePhone: "0316 12 34 56",
    practiceEmail: "rezeption@ordination.at",
  });
  assert.ok(fest);
  assert.equal(fest.href, "");
  assert.equal(fest.telHref, "tel:+43316123456");
  assert.equal(fest.telHref.includes("4314051288"), false);
});

test("live intern draft stays empty without a practice number or inbox — no Huber fallback", () => {
  const draft = liveLineInternDraft({
    id: "th-intern-2",
    pet: "Lissi",
    preview: "Protokoll: Lissi",
    body: "Protokoll Silvia · Tafel\nTier: Lissi",
    ownerName: "Dr. Quelle",
    practiceWhatsapp: "",
    practicePhone: "",
    practiceEmail: "",
  });
  assert.ok(draft);
  assert.equal(draft.href, "");
  assert.equal(draft.smsHref, "");
  assert.equal(draft.mailHref, "");
  assert.equal(draft.telHref, "");
});

test("Heute Notfall queue skips abgeschlossene Fälle", () => {
  const rows = [
    { id: "e1", status: "verbunden" },
    { id: "e2", status: "abgeschlossen" },
    { id: "e3", status: "übernommen" },
  ];
  assert.equal(isOpenEmergency(rows[1]!), false);
  assert.deepEqual(
    openEmergencies(rows).map((e) => e.id),
    ["e1", "e3"],
  );
});
