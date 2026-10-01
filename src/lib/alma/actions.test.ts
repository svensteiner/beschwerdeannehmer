import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayOwner,
  fillActionNames,
  guessOwner,
  guessPet,
  guessSpecies,
  parseSilviaReply,
  type SilviaAction,
} from "./actions.ts";

function book(pet = "Patient"): SilviaAction {
  return {
    type: "book",
    owner: "Klientel",
    pet,
    kind: "Reise / EU-Ausweis",
    concern: "",
    summary: "",
  };
}

test("guessPet reads Bella from a travel sentence without an Akte", () => {
  assert.equal(guessPet("Wir fahren nach Kroatien, Bella braucht den EU-Ausweis"), "Bella");
  assert.equal(guessPet("Meine Katze Mizzi hat Blut und atmet nicht"), "Mizzi");
  assert.equal(guessPet("Oskar braucht Impfung"), "Oskar");
  assert.equal(guessPet("Termin für Nala morgen"), "Nala");
  assert.equal(guessPet("Bitte rufen Sie mich wegen Nala unter 0664 123 45 67 zurück"), "Nala");
  assert.equal(guessPet("Ist am Nationalfeiertag offen?"), "Patient");
  assert.equal(guessPet("Meine Nummer ist 0664 55 66 88"), "Patient");
  assert.equal(guessPet("Ich bin Felix, was kostet das?"), "Patient");
  assert.equal(guessPet("Wastl Impfung morgen"), "Patient");
  assert.equal(guessPet("Ich bin Felix, was kostet das?", { includeDemo: true }), "Felix");
  assert.equal(guessPet("Wastl Impfung morgen", { includeDemo: true }), "Wastl");
  assert.equal(guessPet("Felix braucht Impfung"), "Felix");
  assert.equal(guessPet("Termin für Wastl"), "Wastl");
  assert.equal(guessPet("Termin Impfung für Anna-Lena"), "Anna-Lena");
  assert.equal(guessPet("Termin Impfung für BookWa-Nuri"), "Bookwa-Nuri");
  assert.equal(guessPet("Meine Katze Anna-Lena hat Durchfall"), "Anna-Lena");
  assert.equal(guessPet("Anna-Lena braucht Impfung"), "Anna-Lena");
  assert.equal(guessPet("Bitte rufen Sie mich wegen Anna-Lena zurück"), "Anna-Lena");
  assert.equal(guessPet("Termin für Nala"), "Nala");
});

test("guessPet never turns contact labels into a pet", () => {
  assert.equal(guessPet("Ich bin Audit Owner a, meine Handynummer ist 0660123451."), "Patient");
  assert.equal(guessPet("Meine Telefonnummer ist 0660123451."), "Patient");
  assert.equal(guessPet("Meine Adresse ist Hauptstraße 4."), "Patient");
  assert.equal(
    guessPet("Termin für Anna-Lena, meine Handynummer ist 0660123451."),
    "Anna-Lena",
  );
  assert.equal(
    guessPet("Meine Handynummer ist 0660123451, Nala braucht Impfung."),
    "Nala",
  );
});

test("guessOwner and species from the same utterance", () => {
  assert.equal(guessOwner("Ich bin Frau Berger, Mizzi ist krank"), "Klientel Berger");
  assert.equal(guessOwner("Ich bin Frau Müller-Leitner, Anna-Lena braucht Impfung"), "Klientel Müller-Leitner");
  assert.equal(guessOwner("Frau Müller-Leitner, 0664 55 70 45"), "Klientel Müller-Leitner");
  assert.equal(guessOwner("Frau Pichler, 0664 181 20 08"), "Klientel Pichler");
  assert.equal(guessOwner("Frau Doktor am Apparat"), "Klientel");
  assert.equal(guessOwner("Meine E-Mail ist nowak@example.com"), "Klientel");
  assert.equal(guessOwner("Ich bin Frau Nowak, nowak@example.com"), "Klientel Nowak");
  assert.equal(guessSpecies("Meine Katze Mizzi hat Blut"), "Katze");
  assert.equal(guessOwner("Pichler"), "Klientel");
  assert.equal(guessOwner("Berger, Mizzi ist krank"), "Klientel");
  assert.equal(guessOwner("Pichler", { includeDemo: true }), "Klientel Pichler");
  assert.equal(guessOwner("Berger, Mizzi ist krank", { includeDemo: true }), "Klientel Berger");
  assert.equal(
    fillActionNames(book(), "Termin für Nala, Pichler").owner,
    "Klientel",
  );
  assert.equal(
    fillActionNames(book(), "Termin für Nala, Pichler", { includeDemo: true }).owner,
    "Klientel Pichler",
  );
  assert.equal(fillActionNames(book(), "Ich bin Felix, was kostet das?").pet, "Patient");
  assert.equal(
    fillActionNames(book(), "Ich bin Felix, was kostet das?", { includeDemo: true }).pet,
    "Felix",
  );
});

test("displayOwner drops the Klientel prefix for the desk", () => {
  assert.equal(displayOwner("Klientel Berger"), "Berger");
  assert.equal(displayOwner("Berger"), "Berger");
  assert.equal(displayOwner(""), "Klientel");
});

test("fillActionNames keeps a hyphenated pet and Halterin from one sentence", () => {
  const named = fillActionNames(
    book(),
    "Termin Impfung für Anna-Lena, ich bin Frau Müller-Leitner, 0664 55 70 45",
  );
  assert.equal(named.pet, "Anna-Lena");
  assert.equal(named.owner, "Klientel Müller-Leitner");
  assert.equal(displayOwner(named.owner), "Müller-Leitner");
});

test("fillActionNames puts Bella on a placeholder book action", () => {
  const named = fillActionNames(
    book(),
    "Wir fahren nach Kroatien, Bella braucht den EU-Ausweis",
  );
  assert.equal(named.pet, "Bella");
});

test("fillActionNames still names the pet when the last turn is only a Handy", () => {
  const named = fillActionNames(book(), "Termin für Nala Impfung\nMeine Nummer ist 0664 123 45 67");
  assert.equal(named.pet, "Nala");
});

test("fillActionNames keeps a named Akte and fills Mizzi on emergency", () => {
  const kept = fillActionNames(book("Wastl"), "Wastl ist lahm");
  assert.equal(kept.pet, "Wastl");
  const emergency = fillActionNames(
    {
      type: "emergency",
      owner: "Klientel",
      pet: "Patient",
      kind: "Notfall",
      concern: "",
      summary: "",
    },
    "Meine Katze Mizzi hat Blut und atmet nicht",
  );
  assert.equal(emergency.pet, "Mizzi");
  assert.equal(emergency.species, "Katze");
});

test("a Rückrufzettel reply does not become a book because Silvia said ich lege", () => {
  const user = "Bitte rufen Sie mich unter 0316 55 44 33 zurück, ich bin Frau Moser";
  const spoken = parseSilviaReply(
    `Ich lege einen Rückrufzettel auf die Kassa. Jemand ruft Sie zurück.\n<<ACTION{"type":"none","owner":"Frau Moser","pet":"Patient","kind":"Rückruf","concern":"Rückruf","summary":"Rückrufbitte"}>>`,
    user,
  );
  assert.equal(spoken.action.type, "none");
  assert.equal(spoken.action.kind, "Rückruf");
  const modeledBook = parseSilviaReply(
    `Ich hätte 08:00 frei.\n<<ACTION{"type":"book","owner":"Frau Moser","pet":"Patient","kind":"Termin","concern":"Rückruf","summary":""}>>`,
    user,
  );
  assert.equal(modeledBook.action.type, "none");
  assert.equal(modeledBook.action.kind, "Rückruf");
  const realBook = parseSilviaReply(
    `Ich lege den Slot um 08:00.\n<<ACTION{"type":"book","owner":"Frau Berger","pet":"Nala","kind":"Impfung","concern":"Impfung","summary":""}>>`,
    "Termin für Nala Impfung",
  );
  assert.equal(realBook.action.type, "book");
});

test("Punkt 10: eine getrennt geschriebene Chipnummer wird erkannt", () => {
  const spaced = parseSilviaReply(
    "Ich sehe die Karte.",
    "Termin für Bella, die Chipnummer ist 040 098 100 123 456",
  );
  assert.equal(spaced.action.chip, "040098100123456");
  // Eine Telefonnummer (12 Ziffern) ist keine Chipnummer.
  const phone = parseSilviaReply(
    "Ich sehe die Karte.",
    "Bitte rufen Sie mich unter 0664 123 456 789 zurück",
  );
  assert.equal(phone.action.chip, "");
});
