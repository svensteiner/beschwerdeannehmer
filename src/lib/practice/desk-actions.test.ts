import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerConfirmText } from "../alma/protocol.ts";
import { halterinDraftHref } from "../alma/phone.ts";
import {
  parseRescheduleStart,
  parseWalkIn,
  sanitizeAppointmentStatus,
  sanitizeCallStatus,
  emergencyStatusLabel,
  sanitizeEmergencyStatus,
  umlegenFieldIds,
  HALTERIN_PHONE_HINT,
  HALTERIN_PHONE_LABEL,
  WALK_IN_PLACEHOLDERS,
  DESK_SEARCH_PLACEHOLDER,
  DESK_SEARCH_PLACEHOLDER_AKTE,
  AKTE_EMAIL_PLACEHOLDER,
  walkInFieldIds,
  walkInFromFields,
  walkInStartFromFields,
} from "./desk-status.ts";
import { patientMatchesNeedle, patientSearchNeedle } from "./patient-query.ts";

test("desk statuses only accept the Kassa labels", () => {
  assert.equal(sanitizeAppointmentStatus("bestätigt"), "bestätigt");
  assert.equal(sanitizeAppointmentStatus("abgesagt"), "abgesagt");
  assert.equal(sanitizeAppointmentStatus("drop table"), null);
  assert.equal(sanitizeCallStatus("erledigt"), "erledigt");
  assert.equal(sanitizeCallStatus("hack"), null);
  assert.equal(sanitizeEmergencyStatus("übernommen"), "übernommen");
  assert.equal(sanitizeEmergencyStatus("verbunden"), "verbunden");
  assert.equal(sanitizeEmergencyStatus("abgeschlossen"), "abgeschlossen");
  assert.equal(emergencyStatusLabel("verbunden"), "auf der Tafel");
  assert.equal(emergencyStatusLabel("übernommen"), "übernommen");
  assert.equal(emergencyStatusLabel("abgeschlossen"), "abgeschlossen");
  assert.equal(sanitizeAppointmentStatus("gelegt"), "gelegt");
});

test("walk-in needs owner, pet, a real time, and keeps the Nummer", () => {
  const ok = parseWalkIn({
    pet: "Nala",
    owner: "Berger",
    kind: "Kontrolle",
    start: "2026-08-25T14:00:00",
    phone: "0664 123 45 67",
  });
  assert.equal(ok?.pet, "Nala");
  assert.equal(ok?.owner, "Berger");
  assert.equal(ok?.phone, "06641234567");
  assert.equal(
    parseWalkIn({
      pet: "Resi",
      owner: "Frau Pichler",
      start: "2026-08-25T14:00:00",
      phone: "0316 12 34 56",
    })?.phone,
    "0316123456",
  );
  assert.equal(
    parseWalkIn({
      pet: "Nala",
      owner: "Berger",
      start: "2026-08-25T14:00:00",
      email: "Nowak@Example.com",
    })?.email,
    "nowak@example.com",
  );
  assert.equal(
    parseWalkIn({ pet: "Nala", owner: "Berger", start: "2026-08-25T14:00:00", email: "kein-at" })?.email,
    "",
  );
  assert.equal(parseWalkIn({ pet: "Nala", owner: "", start: "2026-08-25T14:00:00" }), null);
  assert.equal(parseWalkIn({ pet: "N", owner: "Berger", start: "2026-08-25T14:00:00" }), null);
  assert.equal(parseWalkIn({ pet: "Nala", start: "nope" }), null);
  assert.ok(parseRescheduleStart("2026-08-25T16:00:00"));
  assert.equal(parseRescheduleStart("nope"), null);
  const fromFields = walkInStartFromFields("2026-08-27", "15:00");
  assert.equal(fromFields?.getDate(), 27);
  assert.equal(fromFields?.getMonth(), 7);
  assert.equal(fromFields?.getHours(), 15);
  assert.equal(walkInStartFromFields("27.8.2026", "15:00"), null);
  const fromDom = walkInFromFields(
    (id) =>
      ({
        "heute-owner": "  Frau Pichler ",
        "heute-owner-phone": "0664 234 56 78",
        "heute-owner-email": "pichler@example.com",
        "heute-pet": "Poldi",
        "heute-kind": "",
        "heute-time": "15:00",
        "heute-date": "2026-08-27",
      })[id] ?? "",
    {
      owner: "heute-owner",
      phone: "heute-owner-phone",
      email: "heute-owner-email",
      pet: "heute-pet",
      kind: "heute-kind",
      time: "heute-time",
      date: "heute-date",
    },
    "2026-08-25",
  );
  assert.equal(fromDom.owner, "Frau Pichler");
  assert.equal(fromDom.pet, "Poldi");
  assert.equal(fromDom.kind, "Kontrolle");
  assert.equal(fromDom.phone, "0664 234 56 78");
  assert.equal(fromDom.email, "pichler@example.com");
  assert.equal(fromDom.date, "2026-08-27");
  assert.equal(fromDom.start?.getDate(), 27);
  assert.equal(fromDom.start?.getHours(), 15);
  const confirm = ownerConfirmText({
    action: { pet: "Nala" },
    slot: "Dienstag, 25.8. um 15:00",
    practiceName: "Tafel",
  });
  assert.match(halterinDraftHref("0664 123 45 67", confirm), /wa\.me\/436641234567/);
  assert.match(halterinDraftHref("0664 123 45 67", confirm), /Nala/);
  assert.equal(halterinDraftHref("", confirm), "");
  assert.equal(halterinDraftHref("0316 12 34 56", confirm), "");
  const kalender = walkInFieldIds("kalender-");
  assert.deepEqual(kalender, {
    owner: "kalender-owner",
    phone: "kalender-owner-phone",
    email: "kalender-owner-email",
    pet: "kalender-pet",
    kind: "kalender-kind",
    time: "kalender-time",
    date: "kalender-date",
    eintragen: "kalender-eintragen",
    dateAnzeige: "kalender-date-anzeige",
    timeAnzeige: "kalender-time-anzeige",
  });
  const fromKalender = walkInFromFields(
    (id) =>
      ({
        "kalender-owner": "Frau Nowak",
        "kalender-owner-phone": "0664 181 20 08",
        "kalender-pet": "Momo",
        "kalender-kind": "Kontrolle",
        "kalender-time": "15:00",
        "kalender-date": "2026-08-27",
      })[id] ?? "",
    kalender,
    "2026-08-26",
  );
  assert.equal(fromKalender.pet, "Momo");
  assert.equal(fromKalender.owner, "Frau Nowak");
  assert.equal(fromKalender.date, "2026-08-27");
  assert.equal(fromKalender.start?.getDate(), 27);
  assert.equal(fromKalender.start?.getHours(), 15);
  assert.deepEqual(walkInFieldIds("heute-").eintragen, "heute-eintragen");
  assert.equal(walkInFieldIds("heute-").dateAnzeige, "heute-date-anzeige");
  assert.equal(walkInFieldIds("heute-").timeAnzeige, "heute-time-anzeige");
  assert.deepEqual(umlegenFieldIds("slot-1"), {
    open: "umlegen-open-slot-1",
    date: "umlegen-date-slot-1",
    time: "umlegen-time-slot-1",
    dateAnzeige: "umlegen-date-anzeige-slot-1",
    timeAnzeige: "umlegen-time-anzeige-slot-1",
    save: "umlegen-save-slot-1",
    cancel: "umlegen-abbrechen-slot-1",
    drafts: "umlegen-drafts-slot-1",
    wa: "umlegen-wa-slot-1",
    sms: "umlegen-sms-slot-1",
    mail: "umlegen-mail-slot-1",
  });
});

test("walk-in placeholders are generic, not Huber leftover names", () => {
  assert.equal(WALK_IN_PLACEHOLDERS.owner, "Name");
  assert.equal(WALK_IN_PLACEHOLDERS.phone, "0664 … oder 0316 …");
  assert.equal(WALK_IN_PLACEHOLDERS.email, "name@…");
  assert.equal(WALK_IN_PLACEHOLDERS.pet, "Name des Tiers");
  assert.equal(HALTERIN_PHONE_LABEL, "Telefon der Halterin");
  assert.match(HALTERIN_PHONE_HINT, /Festnetz für SMS/);
  const blob = Object.values(WALK_IN_PLACEHOLDERS).join(" ").toLowerCase();
  assert.equal(blob.includes("berger"), false);
  assert.equal(blob.includes("nala"), false);
  assert.equal(blob.includes("nowak"), false);
});

test("Tafel search placeholders are generic, not Huber leftover names", () => {
  assert.equal(DESK_SEARCH_PLACEHOLDER, "Name, name@…, 0664…");
  assert.equal(DESK_SEARCH_PLACEHOLDER_AKTE, "Name, name@…, Chip…");
  assert.equal(AKTE_EMAIL_PLACEHOLDER, "name@… — für Bestätigungs-Mail");
  const blob = [
    DESK_SEARCH_PLACEHOLDER,
    DESK_SEARCH_PLACEHOLDER_AKTE,
    AKTE_EMAIL_PLACEHOLDER,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(blob.includes("berger"), false);
  assert.equal(blob.includes("nala"), false);
  assert.equal(blob.includes("nowak"), false);
  assert.equal(blob.includes("momo"), false);
  assert.equal(blob.includes("mizzi"), false);
  assert.equal(blob.includes("zorro"), false);
  assert.equal(blob.includes("huber"), false);
});

test("Kartei search matches pet, Halterin, Handy, and strips LIKE wildcards", () => {
  assert.equal(patientSearchNeedle("  Nala%_  "), "nala");
  assert.equal(patientSearchNeedle(""), "");
  const nala = { name: "Nala", owner_name: "Frau Berger", phone: "0664 123 45 67", chip: "0400123" };
  const poldi = { name: "Poldi", owner_name: "Frau Pichler", phone: "06642345678", chip: "" };
  assert.equal(patientMatchesNeedle("nala", nala), true);
  assert.equal(patientMatchesNeedle("nala", poldi), false);
  assert.equal(patientMatchesNeedle("berger", nala), true);
  assert.equal(patientMatchesNeedle("0664 123", nala), true);
  assert.equal(patientMatchesNeedle("0400123", nala), true);
  assert.equal(patientMatchesNeedle("pichler", nala), false);
});
