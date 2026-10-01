import assert from "node:assert/strict";
import { test } from "node:test";
import {
  akteDeskLabel,
  akteKontaktLabel,
  akteSearchParams,
  canAttachSpokenPatient,
  canAttachSpokenRow,
  canAttachConfirmOwnerRow,
  pickConfirmOwnerRow,
  contactChanged,
  ownersAlign,
  parseNewAkte,
  patientContactFieldIds,
  patientContactFromFields,
  patientMatchesNeedle,
  patientOwnerKey,
  patientSearchNeedle,
  pickPatientMatch,
  pickHolderAkte,
  sanitizePatientChip,
  sanitizePatientNotes,
  sanitizePatientSpecies,
} from "./patient-query.ts";

test("Akte Kontakt speichern reads Halterin, Handy, E-Mail, Art, Chip and Kassa notes from the fields", () => {
  const ids = patientContactFieldIds("p1");
  assert.equal(ids.owner, "akte-owner-p1");
  assert.equal(ids.phone, "akte-phone-p1");
  assert.equal(ids.email, "akte-email-p1");
  assert.equal(ids.species, "akte-species-p1");
  assert.equal(ids.chip, "akte-chip-p1");
  assert.equal(ids.notes, "akte-notes-p1");
  const stale = { owner: "Klientel", phone: "", email: "", species: "", chip: "", notes: "" };
  const fromDom = patientContactFromFields(
    (id) =>
      ({
        "akte-owner-p1": "  Frau Nowak ",
        "akte-phone-p1": "0664 181 20 08",
        "akte-email-p1": "Nowak@Example.com",
        "akte-species-p1": "  Katze ",
        "akte-chip-p1": "0400 9810 0888 777",
        "akte-notes-p1": "  Nur nachmittags. ",
      })[id] ?? "",
    ids,
  );
  assert.equal(fromDom.owner, "Frau Nowak");
  assert.equal(fromDom.phone, "0664 181 20 08");
  assert.equal(fromDom.email, "nowak@example.com");
  assert.equal(fromDom.species, "Katze");
  assert.equal(fromDom.chip, "040098100888777");
  assert.equal(fromDom.notes, "Nur nachmittags.");
  assert.notEqual(fromDom.owner, stale.owner);
  assert.notEqual(fromDom.phone, stale.phone);
  assert.equal(sanitizePatientChip("0400-9810-0888-777x"), "040098100888777");
  assert.equal(sanitizePatientChip("12345678901234567890"), "123456789012345");
  assert.equal(sanitizePatientChip(""), "");
  assert.equal(sanitizePatientSpecies(" Hund "), "Hund");
  assert.equal(sanitizePatientNotes("  x  "), "x");
  assert.equal(sanitizePatientNotes("n".repeat(500)).length, 400);
});

test("Telefon nachtragen deep-links to the pet card when the Tafel already has it", () => {
  const patients = [
    { id: "a1", name: "Nala" },
    { id: "a2", name: "Zorro" },
  ];
  assert.deepEqual(akteSearchParams("Zorro", patients), { p: "a2" });
  assert.deepEqual(akteSearchParams("Mizzi", patients), { q: "Mizzi" });
  assert.deepEqual(akteSearchParams("Patient", patients), {});
  assert.deepEqual(akteSearchParams("", patients), {});
  assert.deepEqual(
    akteSearchParams("Patient", patients, {
      owner: "Frau Nameless",
      phone: "0664 77 88 99",
    }),
    { q: "Frau Nameless", owner: "Frau Nameless", phone: "0664 77 88 99" },
  );
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", ""), "Akte anlegen");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "a@b.at"), "Akte anlegen");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "", "p-nox"), "E-Mail nachtragen");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "a@b.at", "p-nox"), "Akte");
  assert.equal(akteDeskLabel("Nala", "0664 77 88 99", "a@b.at"), "");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "", undefined, true), "Akte");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "a@b.at", undefined, true), "Akte");
  assert.equal(akteDeskLabel("Patient", "0664 77 88 99", "", "p-nox", true), "Akte");
  assert.equal(akteDeskLabel("Nala", "", "", undefined, true), "Akte");
  assert.equal(akteDeskLabel("Nala", "0664 77 88 99", "a@b.at", undefined, true), "");
  assert.doesNotMatch(akteDeskLabel("Patient", "", "", undefined, true), /anlegen|nachtragen/);
  assert.doesNotMatch(akteDeskLabel("Nala", "0664 77 88 99", "", undefined, true), /anlegen|nachtragen/);
  const kartei = [
    { id: "n1", name: "Nox", owner_name: "Frau Spoken", phone: "0664 22 33 44" },
    { id: "z1", name: "Zettel1", owner_name: "Frau Nameless", phone: "0664 77 88 99" },
    { id: "z2", name: "Zettel2", owner_name: "Frau Nameless", phone: "0664 77 88 99" },
  ];
  assert.equal(pickHolderAkte(kartei, { owner: "Frau Spoken", phone: "0664 22 33 44" })?.id, "n1");
  assert.deepEqual(
    akteSearchParams("Patient", kartei, { owner: "Frau Spoken", phone: "0664 22 33 44" }),
    { p: "n1" },
  );
  assert.equal(pickHolderAkte(kartei, { owner: "Frau Nameless", phone: "0664 77 88 99" }), null);
  assert.deepEqual(
    akteSearchParams("Patient", kartei, { owner: "Frau Nameless", phone: "0664 77 88 99" }),
    { q: "Frau Nameless", owner: "Frau Nameless", phone: "0664 77 88 99" },
  );
  assert.equal(parseNewAkte({ pet: "Nala", owner: "Frau Nameless", phone: "0664 77 88 99" })?.pet, "Nala");
  assert.equal(parseNewAkte({ pet: "Patient", owner: "Frau Nameless" }), null);
  assert.equal(parseNewAkte({ pet: "Hund", owner: "Frau Nameless" }), null);
  assert.equal(parseNewAkte({ pet: "Nummer", owner: "Frau Nameless" }), null);
  assert.equal(parseNewAkte({ pet: "Nala", owner: "A" }), null);
  assert.deepEqual(
    akteSearchParams("Bella", [
      { id: "b1", name: "Bella" },
      { id: "b2", name: "Bella" },
    ]),
    { q: "Bella" },
  );
  assert.equal(akteKontaktLabel("", ""), "Kontakt nachtragen");
  assert.equal(akteKontaktLabel("0664 181 20 08", ""), "E-Mail nachtragen");
  assert.equal(akteKontaktLabel("", "nowak@example.com"), "Telefon nachtragen");
  assert.equal(akteKontaktLabel("0316 12 34 56", ""), "E-Mail nachtragen");
  assert.equal(akteKontaktLabel("0664 181 20 08", "nowak@example.com"), "");
  assert.equal(contactChanged({ phone: "", email: "" }, { phone: "", email: "nowak@example.com" }), true);
  assert.equal(contactChanged({ phone: "", email: "nowak@example.com" }, { phone: "", email: "nowak@example.com" }), false);
  assert.equal(contactChanged({ phone: "06641812008", email: "" }, { phone: "0664 181 20 08", email: "" }), false);
  assert.equal(contactChanged({ phone: "", email: "" }, { phone: "06641812008", email: "" }), true);
});

test("Kartei needle matches name, Halterin, chip, digits, and E-Mail", () => {
  const row = { name: "Nala", owner_name: "Berger", phone: "06641234567", chip: "900", email: "nowak@example.com" };
  assert.equal(patientMatchesNeedle(patientSearchNeedle("nala"), row), true);
  assert.equal(patientMatchesNeedle(patientSearchNeedle("0664"), row), true);
  assert.equal(patientMatchesNeedle(patientSearchNeedle("nowak@"), row), true);
  assert.equal(patientMatchesNeedle(patientSearchNeedle("Poldi"), row), false);
});

test("two Bellas stay two rows unless Chip, Handy or Halterin pick one", () => {
  const nowak = {
    id: "1",
    name: "Bella",
    owner_name: "Frau Nowak",
    phone: "06641812008",
    chip: "040098100888777",
  };
  const berger = {
    id: "2",
    name: "Bella",
    owner_name: "Frau Berger",
    phone: "06641234567",
    chip: "",
  };
  const rows = [nowak, berger];
  assert.equal(pickPatientMatch([nowak], { name: "Bella" })?.id, "1");
  assert.equal(pickPatientMatch([nowak], { name: "Bella", owner: "Frau Berger" }), null);
  assert.equal(pickPatientMatch([nowak], { name: "Bella", owner: "Nowak" })?.id, "1");
  assert.equal(pickPatientMatch(rows, { name: "Bella" }), null);
  assert.equal(pickPatientMatch(rows, { name: "Bella", owner: "Nowak" })?.id, "1");
  assert.equal(pickPatientMatch(rows, { name: "Bella", owner: "Frau Berger" })?.id, "2");
  assert.equal(pickPatientMatch(rows, { name: "Bella", phone: "0664 123 45 67" })?.id, "2");
  assert.equal(pickPatientMatch(rows, { name: "Bella", chip: "0400 9810 0888 777" })?.id, "1");
  assert.equal(pickPatientMatch(rows, { name: "Bella", owner: "Klientel" }), null);
  assert.equal(pickPatientMatch(rows, { name: "Patient", owner: "Nowak" }), null);
  assert.equal(patientOwnerKey("Frau Nowak"), "nowak");
});

test("spoken contact stays on the last Akte only when the Halterin matches", () => {
  assert.equal(ownersAlign("Walk-in Resi", "Frau Moser"), false);
  assert.equal(ownersAlign("Frau Moser", "Moser"), true);
  assert.equal(canAttachSpokenPatient("Walk-in Resi", "Frau Moser"), false);
  assert.equal(canAttachSpokenPatient("Walk-in Resi", ""), true);
  assert.equal(canAttachSpokenPatient("", "Frau Moser"), true);
  assert.equal(canAttachSpokenPatient("Frau Moser", "Klientel Moser"), true);
  assert.equal(canAttachSpokenPatient("Klientel", "Frau Moser"), true);
  assert.equal(canAttachSpokenRow({ name: "Nala", owner_name: "Klientel" }, ""), true);
  assert.equal(canAttachSpokenRow({ name: "Nummer", owner_name: "Klientel" }, ""), false);
  assert.equal(canAttachSpokenRow({ name: "Patient", owner_name: "Klientel" }, "Frau Moser"), false);
  assert.equal(canAttachSpokenRow({ name: "Nala", owner_name: "Walk-in Resi" }, "Frau Moser"), false);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Frau Holzer" }, "Frau Holzer"), true);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Holzer" }, "Frau Holzer"), true);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Frau Leitgeb" }, "Frau Holzer"), false);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Klientel" }, "Frau Holzer"), false);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Frau Holzer" }, ""), false);
  assert.equal(
    pickConfirmOwnerRow(
      [
        { id: "leftover", owner_name: "Frau Leitgeb" },
        { id: "holzer", owner_name: "Frau Holzer" },
      ],
      "Frau Holzer",
    )?.id,
    "holzer",
  );
});

test("gleicher Nachname allein ist kein Identitätsnachweis", () => {
  // Vorher trug der Nachname allein: „Anna Berger“ und „Maria Berger“ galten
  // als dieselbe Halterin, und Kontaktdaten konnten an der falschen Kartei
  // landen.
  assert.equal(ownersAlign("Anna Berger", "Maria Berger"), false);
  assert.equal(ownersAlign("Frau Anna Berger", "Maria Berger"), false);

  // Der Nachname trägt nur, wenn eine Seite NUR ihn nennt.
  assert.equal(ownersAlign("Anna Berger", "Berger"), true);
  assert.equal(ownersAlign("Berger", "Maria Berger"), true);

  // Gleiche Person bleibt gleich, auch mit zweitem Vornamen.
  assert.equal(ownersAlign("Anna Berger", "Anna Berger"), true);
  assert.equal(ownersAlign("Frau Anna Berger", "Anna Berger"), true);
  assert.equal(ownersAlign("Anna Maria Berger", "Anna Berger"), true);

  // Und für das Zuordnen vertraulicher Daten heißt das: nicht anhängen.
  assert.equal(canAttachSpokenPatient("Maria Berger", "Anna Berger"), false);
  assert.equal(canAttachConfirmOwnerRow({ owner_name: "Maria Berger" }, "Anna Berger"), false);
  // Gleich bleibt gleich.
  assert.equal(canAttachSpokenPatient("Anna Berger", "Anna Berger"), true);
});

test("mehrere passende Halterinnen bleiben offen statt erster Treffer", () => {
  const rows = [
    { id: "anna", owner_name: "Anna Berger" },
    { id: "maria", owner_name: "Maria Berger" },
  ];
  // Nur der Nachname genannt: beide passen, die Zuordnung ist mehrdeutig.
  // Vorher gewann still „anna“.
  assert.equal(pickConfirmOwnerRow(rows, "Berger"), null, "mehrdeutig heißt nachfragen");
  // Mit Vornamen ist es wieder eindeutig.
  assert.equal(pickConfirmOwnerRow(rows, "Anna Berger")?.id, "anna");
  assert.equal(pickConfirmOwnerRow(rows, "Maria Berger")?.id, "maria");
  // Genau eine passende Zeile bleibt eindeutig.
  assert.equal(pickConfirmOwnerRow([{ id: "only", owner_name: "Anna Berger" }], "Berger")?.id, "only");
  // Niemand passt.
  assert.equal(pickConfirmOwnerRow(rows, "Leitgeb"), null);
});
