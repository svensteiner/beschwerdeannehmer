import assert from "node:assert/strict";
import { test } from "node:test";
import { firstHandy, firstPhone, guessEmail, guessPhone, halterinDraftHref, halterinMailHref, halterinSmsHref, internInboxMissing, internInboxSameAsLogin, internPracticeInbox, internWhatsappMissing, isAtHandy, isAtPhone, isCallbackTurn, isContactOnlyTurn, isEmailFollowUp, isHandyOnlyTurn, isKassaTransferTurn, isNameFollowUp, isPhoneFollowUp, mailtoHref, parseKeptInbox, parseKeptNachtdienstPhone, parseKeptPhone, parseKeptWhatsapp, parsePracticeInbox, parsePracticeNachtdienst, parsePracticePhone, parsePracticeWhatsapp, NACHTDIENST_PHONE_EMPTY_ERROR, PRACTICE_INBOX_EMPTY_ERROR, PRACTICE_INBOX_INVALID_ERROR, PRACTICE_INBOX_SAME_LOGIN_ERROR, PRACTICE_PHONE_EMPTY_ERROR, PRACTICE_PHONE_INVALID_ERROR, NACHTDIENST_PHONE_INVALID_ERROR, PRACTICE_WHATSAPP_EMPTY_ERROR, PRACTICE_WHATSAPP_FESTNETZ_ERROR, sanitizeHalterinEmail, signupInbox, signupWhatsapp, telHref, threadDraftDest, toWaMeNumber, waMeHref, smsHref, withHandyAsk, bookedCallAction, displayCallAction, booksDeskSlot, coerceDeskTicketAction, wantsAppointment, alignSpokenDeskTicket, looksLikeBookedSlotSpeech, CALLBACK_SPOKEN, KASSA_SPOKEN, callbackSpoken, bookSkipsLlm, callbackSkipsLlm, contactFollowUpSkipsLlm } from "./phone.ts";
import { ownerCancelText, ownerConfirmText, ownerRescheduleText } from "./protocol.ts";

test("Austrian numbers become wa.me E.164 without plus", () => {
  assert.equal(toWaMeNumber("+43 664 181 20 08"), "436641812008");
  assert.equal(toWaMeNumber("0664 181 20 08"), "436641812008");
  assert.equal(toWaMeNumber("0043 316 555 00"), "4331655500");
  assert.equal(toWaMeNumber(""), "");
  assert.equal(telHref("0664 181 20 08"), "tel:+436641812008");
  assert.equal(telHref(""), "");
});

test("hrefs stay empty without a destination", () => {
  assert.equal(waMeHref("", "Hallo"), "");
  assert.equal(smsHref("", "Hallo"), "");
  assert.equal(mailtoHref("not-an-email", "Betreff", "Text"), "");
  assert.match(waMeHref("+43 664 1812008", "Protokoll"), /^https:\/\/wa\.me\/436641812008\?text=/);
  assert.equal(smsHref("0664 181 20 08", "Termin liegt"), "sms:+436641812008?body=Termin%20liegt");
  assert.match(mailtoHref("rezeption@ordination.at", "Termin Bruno", "liegt"), /^mailto:rezeption@ordination\.at/);
});

test("halterin draft goes to the Halterin, never the practice line", () => {
  const href = halterinDraftHref("0664 123 45 67", "Termin liegt");
  assert.match(href, /^https:\/\/wa\.me\/436641234567\?text=/);
  assert.match(href, /Termin%20liegt/);
  assert.equal(halterinDraftHref("", "Termin liegt"), "");
  assert.equal(halterinDraftHref(undefined, "Termin liegt"), "");
  assert.equal(halterinDraftHref("0316 12 34 56", "Termin liegt"), "");
  assert.equal(halterinDraftHref("01 405 12 88", "Termin liegt"), "");
  assert.equal(halterinSmsHref("0664 123 45 67", "Termin liegt"), "sms:+436641234567?body=Termin%20liegt");
  assert.equal(halterinSmsHref("0316 12 34 56", "Termin liegt"), "sms:+43316123456?body=Termin%20liegt");
  assert.equal(halterinSmsHref("", "Termin liegt"), "");
  assert.equal(halterinSmsHref(undefined, "Termin liegt"), "");
});

test("halterin mail opens mailto with empty To unless the Halterin has an address", () => {
  const emptyTo = halterinMailHref("Termin Momo · Tafel", "Termin liegt");
  assert.equal(emptyTo.startsWith("mailto:?subject="), true);
  assert.match(decodeURIComponent(emptyTo), /Termin liegt/);
  assert.equal(emptyTo.includes("rezeption@"), false);
  assert.equal(emptyTo.includes("ordination@"), false);
  assert.equal(halterinMailHref("Termin Momo · Tafel", "Termin liegt", "   ").startsWith("mailto:?"), true);
  assert.equal(halterinMailHref("Termin Momo · Tafel", "Termin liegt", "kein-at").startsWith("mailto:?"), true);
  assert.equal(sanitizeHalterinEmail("Nowak@Example.com"), "nowak@example.com");
  assert.equal(sanitizeHalterinEmail("kein-at"), "");
  assert.equal(sanitizeHalterinEmail("rezeption@ordination.at"), "rezeption@ordination.at");
  const withAddr = halterinMailHref("Termin Momo · Tafel", "Termin liegt", "nowak@example.com");
  assert.equal(withAddr.startsWith("mailto:nowak@example.com?"), true);
  assert.equal(withAddr.includes("rezeption@"), false);
  assert.equal(mailtoHref("", "Betreff", "Text"), "");
  assert.equal(mailtoHref("rezeption@ordination.at", "Betreff", "Text").startsWith("mailto:rezeption@ordination.at"), true);
});

test("confirm and cancel copy name the pet and the slot", () => {
  const confirm = ownerConfirmText({
    action: { pet: "Nala" },
    slot: "Dienstag, 25.8. um 15:00",
    practiceName: "Tierordination Murtal",
  });
  assert.match(confirm, /Nala/);
  assert.match(confirm, /15:00/);
  assert.match(confirm, /Murtal/);
  const cancel = ownerCancelText({
    action: { pet: "Nala" },
    slot: "Dienstag, 25.8. um 15:00",
    practiceName: "Tierordination Murtal",
  });
  assert.match(cancel, /fällt aus/);
  assert.match(cancel, /Nala/);
  const moved = ownerRescheduleText({
    pet: "Nala",
    oldSlot: "Donnerstag, 27.8. um 15:00",
    newSlot: "Donnerstag, 27.8. um 16:00",
    practiceName: "Tierordination Murtal",
  });
  assert.match(moved, /Nala/);
  assert.match(moved, /umgelegt/);
  assert.match(moved, /15:00/);
  assert.match(moved, /16:00/);
  assert.equal(moved.includes("liegt:"), false);
  const unnamed = ownerRescheduleText({
    pet: "",
    oldSlot: "Donnerstag, 27.8. um 15:00",
    newSlot: "Donnerstag, 27.8. um 16:00",
    practiceName: "Tafel",
  });
  assert.match(unnamed, /Ihr Termin ist umgelegt/);
  assert.equal(unnamed.includes("Patient"), false);
  const nameless = ownerConfirmText({
    action: { pet: "Patient", owner: "Frau Wallner" },
    slot: "Montag, 31.8. um 10:30",
    practiceName: "Tafel Graz",
  });
  assert.match(nameless, /Frau Wallner/);
  assert.equal(nameless.includes("Patient"), false);
  assert.match(
    ownerCancelText({
      action: { pet: "Patient", owner: "Frau Wallner" },
      slot: "Montag, 31.8. um 10:30",
      practiceName: "Tafel Graz",
    }),
    /Frau Wallner/,
  );
  assert.equal(
    ownerCancelText({
      action: { pet: "Patient", owner: "Frau Wallner" },
      slot: "Montag, 31.8. um 10:30",
      practiceName: "Tafel Graz",
    }).includes("Patient"),
    false,
  );
  const noName = ownerConfirmText({
    action: { pet: "Patient", owner: "Klientel" },
    slot: "Montag, 31.8. um 08:00",
    practiceName: "Tafel",
  });
  assert.match(noName, /Ihr Termin liegt/);
  assert.equal(noName.includes("Patient"), false);
});

test("firstPhone prefers the Halterin over the Ordination", () => {
  assert.equal(firstPhone("0664 123 45 67", "+43 1 405 12 88"), "0664 123 45 67");
  assert.equal(firstPhone("", "+43 1 405 12 88"), "+43 1 405 12 88");
  assert.equal(firstPhone("", "   "), "");
});

test("intern WhatsApp is an AT Handy, Festnetz stays on SMS", () => {
  assert.equal(isAtHandy("0664 123 45 67"), true);
  assert.equal(isAtHandy("+43 664 181 20 08"), true);
  assert.equal(isAtHandy("0316 12 34 56"), false);
  assert.equal(isAtHandy("01 405 12 88"), false);
  assert.equal(isAtHandy(""), false);
  assert.equal(firstHandy("0316 12 34 56", "0664 98 76 54"), "0664 98 76 54");
  assert.equal(firstHandy("0316 12 34 56", "01 405 12 88"), "");
  assert.equal(signupWhatsapp("0664 12 34 56"), "0664 12 34 56");
  assert.equal(signupWhatsapp("0316 12 34 56"), "");
  assert.equal(signupWhatsapp("0316 12 34 56", "0664 55 66 77"), "0664 55 66 77");
  assert.equal(signupWhatsapp("0316 12 34 56", "01 405 12 88"), "");
  assert.equal(signupWhatsapp("0664 12 34 56", "0316 99 88 77"), "0664 12 34 56");
  assert.equal(signupInbox("kassa@example.com", "rezeption@ordination.at"), "rezeption@ordination.at");
  assert.equal(signupInbox("kassa@example.com", ""), "kassa@example.com");
  assert.equal(signupInbox("kassa@example.com", "kein-at"), "kassa@example.com");
  assert.equal(signupInbox("Kassa@Example.com"), "kassa@example.com");
  assert.equal(internInboxSameAsLogin("kassa@example.com", "Kassa@Example.com"), true);
  assert.equal(internInboxSameAsLogin("rezeption@ordination.at", "kassa@example.com"), false);
  assert.equal(internInboxSameAsLogin("", "kassa@example.com"), false);
  assert.equal(internPracticeInbox("rezeption@ordination.at", "kassa@example.com"), "rezeption@ordination.at");
  assert.equal(internPracticeInbox("kassa@example.com", "Kassa@Example.com"), "");
  assert.equal(internPracticeInbox("", "kassa@example.com"), "");
  assert.equal(internPracticeInbox("kein-at", "kassa@example.com"), "");
  assert.equal(internInboxMissing("kassa@example.com", "kassa@example.com"), true);
  assert.equal(internInboxMissing("rezeption@ordination.at", "kassa@example.com"), false);
  // registerPractice uses parsePracticeInbox — empty or same as Anmelden stays on /registrieren
  assert.deepEqual(parsePracticeInbox("rezeption@ordination.at", "kassa@example.com"), {
    ok: true,
    value: "rezeption@ordination.at",
  });
  assert.deepEqual(parsePracticeInbox("kassa@example.com", "Kassa@Example.com"), {
    ok: false,
    error: PRACTICE_INBOX_SAME_LOGIN_ERROR,
  });
  assert.deepEqual(parsePracticeInbox("   ", "kassa@example.com"), {
    ok: false,
    error: PRACTICE_INBOX_EMPTY_ERROR,
  });
  assert.deepEqual(parsePracticeInbox("kein-at", "kassa@example.com"), {
    ok: false,
    error: PRACTICE_INBOX_INVALID_ERROR,
  });
  assert.deepEqual(parseKeptInbox("", "rezeption@ordination.at", "kassa@example.com"), {
    ok: true,
    value: "rezeption@ordination.at",
  });
  assert.deepEqual(parseKeptInbox("  rezeption.neu@ordination.at  ", "rezeption@ordination.at", "kassa@example.com"), {
    ok: true,
    value: "rezeption.neu@ordination.at",
  });
  assert.deepEqual(parseKeptInbox("", "", "kassa@example.com"), {
    ok: false,
    error: PRACTICE_INBOX_EMPTY_ERROR,
  });
  assert.deepEqual(parseKeptInbox("", "kassa@example.com", "Kassa@Example.com"), {
    ok: false,
    error: PRACTICE_INBOX_SAME_LOGIN_ERROR,
  });
  assert.deepEqual(parseKeptInbox("kassa@example.com", "rezeption@ordination.at", "kassa@example.com"), {
    ok: false,
    error: PRACTICE_INBOX_SAME_LOGIN_ERROR,
  });
  assert.doesNotMatch(
    JSON.stringify(parseKeptInbox("", "rezeption@ordination.at", "kassa@example.com")),
    /Huber|Josefstadt|nowak@/i,
  );
  assert.equal(internWhatsappMissing("0316 12 34 56", "0316 12 34 56"), true);
  assert.equal(internWhatsappMissing("0664 12 34 56", "0316 12 34 56"), false);
  assert.deepEqual(parsePracticeWhatsapp("0664 55 66 77"), { ok: true, value: "0664 55 66 77" });
  assert.deepEqual(parsePracticeWhatsapp("  +43 664 181 20 08 "), { ok: true, value: "+43 664 181 20 08" });
  assert.deepEqual(parsePracticeWhatsapp("0316 735873"), { ok: false, error: PRACTICE_WHATSAPP_FESTNETZ_ERROR });
  assert.deepEqual(parsePracticeWhatsapp("01 405 12 88"), { ok: false, error: PRACTICE_WHATSAPP_FESTNETZ_ERROR });
  assert.deepEqual(parsePracticeWhatsapp("   "), { ok: false, error: PRACTICE_WHATSAPP_EMPTY_ERROR });
  assert.deepEqual(parseKeptWhatsapp("", "0664 55 67 40"), { ok: true, value: "0664 55 67 40" });
  assert.deepEqual(parseKeptWhatsapp("0664 90 80 70", "0664 55 67 40"), { ok: true, value: "0664 90 80 70" });
  assert.deepEqual(parseKeptWhatsapp("", ""), { ok: true, value: "" });
  assert.deepEqual(parseKeptWhatsapp("0316 73 59 40", "0664 55 67 40"), {
    ok: false,
    error: PRACTICE_WHATSAPP_FESTNETZ_ERROR,
  });
  assert.deepEqual(parseKeptWhatsapp("", "01 405 12 88"), { ok: true, value: "" });
  assert.doesNotMatch(JSON.stringify(parseKeptWhatsapp("", "0664 55 67 40")), /01 405 12 88|Huber|Josefstadt/i);
});

test("internInboxSameAsLogin is true until Inbox differs from Anmelden", () => {
  assert.equal(
    internInboxSameAsLogin("kassa@example.com", "kassa@example.com"),
    true,
  );
  assert.equal(
    internInboxSameAsLogin("kassa@example.com", "Kassa@Example.com"),
    true,
  );
  assert.equal(
    internInboxSameAsLogin(
      "rezeption@ordination.example.com",
      "kassa@example.com",
    ),
    false,
  );
  assert.equal(internInboxSameAsLogin("", "kassa@example.com"), false);
  assert.equal(internInboxSameAsLogin("kassa@example.com", ""), false);
});

test("Nachtdienst accepts AT Handy or Festnetz and never invents a clinic number", () => {
  assert.equal(isAtPhone("0316 80 12 34"), true);
  assert.equal(isAtPhone("0664 90 80 70"), true);
  assert.equal(isAtPhone("01 405 12 88"), true);
  assert.equal(isAtPhone("0664 12"), false);
  assert.equal(isAtPhone(""), false);
  assert.deepEqual(parsePracticeNachtdienst({ phone: "0316 80 12 34", name: "Bereitschaft" }), {
    ok: true,
    phone: "0316 80 12 34",
    name: "Bereitschaft",
  });
  assert.deepEqual(parsePracticeNachtdienst({ phone: "0664 90 80 70" }), {
    ok: true,
    phone: "0664 90 80 70",
    name: "",
  });
  assert.deepEqual(parsePracticeNachtdienst({ phone: "" }), { ok: false, error: NACHTDIENST_PHONE_EMPTY_ERROR });
  assert.deepEqual(parsePracticeNachtdienst({ phone: "abc" }), { ok: false, error: NACHTDIENST_PHONE_INVALID_ERROR });
  assert.deepEqual(parsePracticeNachtdienst({ phone: "123" }), { ok: false, error: NACHTDIENST_PHONE_INVALID_ERROR });
  assert.doesNotMatch(JSON.stringify(parsePracticeNachtdienst({ phone: "0316 80 12 34" })), /Vetmeduni|25077/i);
  // registerPractice uses parsePracticeNachtdienst — empty stays on /registrieren, never Vetmeduni
  assert.deepEqual(parseKeptNachtdienstPhone("", "0316 80 12 34"), { ok: true, phone: "0316 80 12 34" });
  assert.deepEqual(parseKeptNachtdienstPhone("0664 90 80 70", "0316 80 12 34"), {
    ok: true,
    phone: "0664 90 80 70",
  });
  assert.deepEqual(parseKeptNachtdienstPhone("", ""), { ok: false, error: NACHTDIENST_PHONE_EMPTY_ERROR });
  assert.deepEqual(parseKeptNachtdienstPhone("abc", "0316 80 12 34"), {
    ok: false,
    error: NACHTDIENST_PHONE_INVALID_ERROR,
  });
  assert.doesNotMatch(JSON.stringify(parseKeptNachtdienstPhone("0316 80 12 34", "")), /Vetmeduni|25077/i);
});

test("practice Leitung accepts AT Handy or Festnetz on Heute and signup — never Huber", () => {
  assert.deepEqual(parsePracticePhone("0316 73 58 73"), { ok: true, value: "0316 73 58 73" });
  assert.deepEqual(parsePracticePhone("  0664 55 66 88 "), { ok: true, value: "0664 55 66 88" });
  assert.deepEqual(parsePracticePhone(""), { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR });
  assert.deepEqual(parsePracticePhone("   "), { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR });
  assert.deepEqual(parsePracticePhone("123"), { ok: false, error: PRACTICE_PHONE_INVALID_ERROR });
  assert.deepEqual(parsePracticePhone("abc"), { ok: false, error: PRACTICE_PHONE_INVALID_ERROR });
  assert.doesNotMatch(JSON.stringify(parsePracticePhone("0316 73 58 73")), /405\s*12\s*88|Josefstadt/i);
  assert.deepEqual(parseKeptPhone("", "0316 73 59 40"), { ok: true, value: "0316 73 59 40" });
  assert.deepEqual(parseKeptPhone("  0664 55 66 88  ", "0316 73 59 40"), { ok: true, value: "0664 55 66 88" });
  assert.deepEqual(parseKeptPhone("", ""), { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR });
  assert.deepEqual(parseKeptPhone("", "01 405 12 88"), { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR });
  assert.deepEqual(parseKeptPhone("abc", "0316 73 59 40"), { ok: false, error: PRACTICE_PHONE_INVALID_ERROR });
  assert.doesNotMatch(JSON.stringify(parseKeptPhone("", "0316 73 59 40")), /405\s*12\s*88|Huber|Josefstadt/i);
});

test("intern protocol stays on the practice, Klientel never does", () => {
  const intern = threadDraftDest({
    intern: true,
    ownerPhone: "0664 123 45 67",
    practiceWhatsapp: "01 405 12 88",
  });
  assert.equal(intern.kind, "intern");
  assert.equal(intern.phone, "01 405 12 88");
  assert.equal(intern.whatsapp, "");
  const internHandy = threadDraftDest({
    intern: true,
    practiceWhatsapp: "0664 98 76 54",
    practicePhone: "0316 12 34 56",
  });
  assert.equal(internHandy.whatsapp, "0664 98 76 54");
  assert.equal(internHandy.phone, "0664 98 76 54");
  const halterin = threadDraftDest({
    intern: false,
    ownerPhone: "0664 123 45 67",
    practiceWhatsapp: "01 405 12 88",
    practicePhone: "01 405 12 88",
  });
  assert.equal(halterin.kind, "halterin");
  assert.equal(halterin.phone, "0664 123 45 67");
  assert.equal(halterin.whatsapp, "0664 123 45 67");
  const festnetz = threadDraftDest({
    intern: false,
    ownerPhone: "0316 12 34 56",
    practiceWhatsapp: "0664 98 76 54",
  });
  assert.equal(festnetz.phone, "0316 12 34 56");
  assert.equal(festnetz.whatsapp, "");
  const missing = threadDraftDest({ intern: false, practiceWhatsapp: "01 405 12 88" });
  assert.equal(missing.kind, "halterin");
  assert.equal(missing.phone, "");
});

test("guessPhone reads an Austrian Handy, Graz Festnetz, Wien, and skips chips", () => {
  assert.equal(guessPhone("Meine Nummer ist 0664 123 45 67, Nala braucht Impfung"), "06641234567");
  assert.equal(guessPhone("Bitte unter +43 664 181 20 08 zurückrufen"), "+436641812008");
  assert.equal(guessPhone("Meine Nummer ist 0316 12 34 56, Nala braucht Impfung"), "0316123456");
  assert.equal(guessPhone("Bitte unter 01 405 12 88 zurückrufen"), "014051288");
  assert.equal(guessPhone("Innsbruck 0512 34 56 78"), "0512345678");
  assert.equal(guessPhone("Bitte unter +43 316 555 00 zurückrufen"), "+4331655500");
  assert.equal(
    guessPhone("Der Nachtdienst ist Nachtdienst unter 0316 38 23 36. Meine Nummer ist 0664 55 69 45."),
    "0664556945",
  );
  assert.equal(guessPhone("Chip 040012345678901, bitte nachschauen"), "");
  assert.equal(guessPhone("Ist am Dienstag offen?"), "");
  assert.equal(guessPhone("Der Slot um 08:00 ist frei"), "");
});

test("booking copy asks for name and Nummer unless they are already in the call", () => {
  assert.match(withHandyAsk("Ich lege den Slot.", "Termin für Nala"), /Wie heißen Sie/);
  assert.match(withHandyAsk("Ich lege den Slot.", "Termin für Nala"), /Nummer soll die Bestätigung/);
  assert.match(withHandyAsk("Ich lege den Slot.", "Termin für Nala"), /Handy für WhatsApp/);
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, 0664 123 45 67"),
    /06641234567/,
  );
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, ich bin Frau Berger, 0664 123 45 67"),
    /Berger/,
  );
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, ich bin Frau Berger, 0664 123 45 67"),
    /SMS, WhatsApp oder E-Mail/,
  );
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, ich bin Frau Berger, 0316 12 34 56"),
    /0316123456/,
  );
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, ich bin Frau Berger, 0316 12 34 56"),
    /WhatsApp braucht ein Handy/,
  );
  assert.doesNotMatch(
    withHandyAsk("Ich lege den Slot.", "Termin für Nala, ich bin Frau Berger, 0316 12 34 56"),
    /öffnet SMS, WhatsApp oder E-Mail/,
  );
  assert.equal(isPhoneFollowUp("Meine Nummer ist 0664 123 45 67"), true);
  assert.equal(isPhoneFollowUp("Meine Nummer ist 0316 12 34 56"), true);
  assert.equal(isPhoneFollowUp("Termin für Nala Impfung, 0664 123 45 67"), false);
  assert.equal(guessEmail("Meine Mail ist Nowak@Example.com, danke"), "nowak@example.com");
  assert.equal(guessEmail("Chip 040012345678901"), "");
  assert.equal(guessEmail("kein-at Wort"), "");
  assert.equal(isEmailFollowUp("Meine E-Mail ist nowak@example.com"), true);
  assert.equal(isEmailFollowUp("Termin für Nala Impfung, nowak@example.com"), false);
  assert.equal(isContactOnlyTurn("none", "Meine E-Mail ist nowak@example.com"), true);
  assert.equal(contactFollowUpSkipsLlm({ message: "Meine Nummer ist 0664 55 66 78" }), true);
  assert.equal(contactFollowUpSkipsLlm({ message: "Ich bin Frau Spoken" }), true);
  assert.equal(contactFollowUpSkipsLlm({ message: "Meine Nummer ist 0664 55 66 78", train: true }), false);
  assert.equal(contactFollowUpSkipsLlm({ message: "Termin für Nala, 0664 55 66 78" }), false);
  assert.equal(contactFollowUpSkipsLlm({ message: "Rufen Sie mich zurück, bitte." }), false);
  assert.equal(isContactOnlyTurn("book", "Termin für Nala, nowak@example.com"), false);
  assert.match(withHandyAsk("Ich lege den Slot.", "Termin für Nala"), /E-Mail darf sie auch nennen/);
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Meine E-Mail ist nowak@example.com"),
    /E-Mail nowak@example.com liegt/,
  );
  assert.match(
    withHandyAsk("Ich lege den Slot.", "Meine E-Mail ist nowak@example.com"),
    /welche Nummer/,
  );
});

test("Handy-only turns must not book a second slot", () => {
  assert.equal(isHandyOnlyTurn("none", "Meine Nummer ist 0664 123 45 67"), true);
  assert.equal(isHandyOnlyTurn("book", "Meine Nummer ist 0664 181 20 08"), true);
  assert.equal(isHandyOnlyTurn("book", "Termin für Nala, 0664 123 45 67"), false);
  assert.equal(isHandyOnlyTurn("emergency", "Meine Nummer ist 0664 123 45 67"), false);
  assert.equal(isNameFollowUp("Ich bin Frau Berger"), true);
  assert.equal(isNameFollowUp("Frau Doktor"), false);
  assert.equal(isNameFollowUp("Meine E-Mail ist nowak@example.com"), false);
  assert.equal(isContactOnlyTurn("none", "Ich bin Frau Pichler"), true);
  assert.equal(isContactOnlyTurn("book", "Termin für Nala, Frau Berger"), false);
});

test("a Rückruf with Handy still lands on the board", () => {
  assert.equal(isCallbackTurn("Rückruf", "Hallo"), true);
  assert.equal(isCallbackTurn("", "Bitte rufen Sie uns zurück wegen Nala"), true);
  assert.equal(isCallbackTurn("Info", "Ist am Dienstag offen?"), false);
  assert.equal(callbackSkipsLlm({ message: "Rufen Sie mich zurück, bitte." }), true);
  assert.equal(callbackSkipsLlm({ message: "Bitte rufen Sie uns zurück wegen Nala" }), true);
  assert.equal(callbackSkipsLlm({ message: "Bitte keinen Termin buchen, nur zurückrufen." }), true);
  assert.equal(callbackSkipsLlm({ message: "Rufen Sie mich zurück, bitte.", train: true }), false);
  assert.equal(callbackSkipsLlm({ message: "Termin für Nala Impfung" }), false);
  assert.equal(callbackSkipsLlm({ message: "Wann habt ihr offen?" }), false);
  assert.equal(isCallbackTurn("Rückruf", "Ich möchte keinen Rückruf, nur die Öffnungszeiten wissen."), false);
  assert.equal(isContactOnlyTurn("none", "Bitte unter 0664 123 45 67 zurückrufen"), false);
  assert.equal(isHandyOnlyTurn("none", "Bitte unter 0664 123 45 67 zurückrufen, ich bin Frau Berger"), false);
  assert.equal(wantsAppointment("Bitte rufen Sie mich unter 0316 55 44 33 zurück"), false);
  assert.equal(wantsAppointment("Bitte keinen Termin buchen, nur zurückrufen."), false);
  assert.equal(wantsAppointment("Ich habe noch keinen Termin und möchte einen buchen."), true);
  assert.equal(wantsAppointment("Keinen Termin am Montag, sondern einen am Dienstag."), true);
  assert.equal(wantsAppointment("Termin für Nala Impfung"), true);
  assert.equal(bookSkipsLlm({ message: "Termin für Nala Impfung" }), true);
  assert.equal(bookSkipsLlm({ message: "Impfung für Resi am Montag" }), true);
  assert.equal(bookSkipsLlm({ message: "Was kostet Impfung?" }), false);
  assert.equal(bookSkipsLlm({ message: "Termin für Nala Impfung", isDemo: true }), false);
  assert.equal(bookSkipsLlm({ message: "Termin für Nala Impfung", train: true }), false);
  assert.equal(bookSkipsLlm({ message: "Rufen Sie mich zurück, bitte." }), false);
  assert.equal(
    booksDeskSlot({ type: "book", kind: "Termin" }, "Bitte rufen Sie mich unter 0316 55 44 33 zurück"),
    false,
  );
  assert.equal(
    booksDeskSlot({ type: "book", kind: "Termin" }, "Bitte keinen Termin buchen, nur zurückrufen."),
    false,
  );
  assert.equal(
    booksDeskSlot({ type: "book", kind: "Termin" }, "Bitte keinen Termin buchen."),
    false,
  );
  assert.equal(
    booksDeskSlot({ type: "book", kind: "Impfung" }, "Termin für Nala Impfung"),
    true,
  );
  assert.equal(bookedCallAction("Termin"), "Termin gelegt");
  assert.equal(bookedCallAction("termin"), "Termin gelegt");
  assert.equal(bookedCallAction(""), "Termin gelegt");
  assert.equal(bookedCallAction("Impfung"), "Termin Impfung gelegt");
  assert.doesNotMatch(bookedCallAction("Termin"), /Termin Termin/);
  assert.equal(displayCallAction("Termin Termin gelegt"), "Termin gelegt");
  assert.equal(displayCallAction("termin termin gelegt"), "Termin gelegt");
  assert.equal(displayCallAction("Termin gelegt"), "Termin gelegt");
  assert.equal(displayCallAction("Termin Impfung gelegt"), "Termin Impfung gelegt");
  assert.equal(displayCallAction("Rückrufzettel"), "Rückrufzettel");
  assert.doesNotMatch(displayCallAction("Termin Termin gelegt"), /Termin Termin/);
  const coerced = coerceDeskTicketAction(
    { type: "book", kind: "Termin", summary: "" },
    "Bitte rufen Sie mich unter 0664 123 45 67 zurück, ich bin Frau Moser",
  );
  assert.equal(coerced.type, "none");
  assert.equal(coerced.kind, "Rückruf");
  const deniedBooking = coerceDeskTicketAction(
    { type: "book", kind: "Termin", summary: "Slot" },
    "Bitte keinen Termin buchen.",
  );
  assert.equal(deniedBooking.type, "none");
  assert.equal(deniedBooking.kind, "Info");
  const deniedBookingForCallback = coerceDeskTicketAction(
    { type: "book", kind: "Termin", summary: "Slot" },
    "Bitte keinen Termin buchen, nur zurückrufen.",
  );
  assert.equal(deniedBookingForCallback.type, "none");
  assert.equal(deniedBookingForCallback.kind, "Rückruf");
  assert.equal(
    coerceDeskTicketAction({ type: "book", kind: "Impfung", summary: "" }, "Termin für Nala Impfung").type,
    "book",
  );
  assert.equal(
    coerceDeskTicketAction({ type: "book", kind: "Termin", summary: "" }, "Keinen Termin am Montag, sondern einen am Dienstag.").type,
    "book",
  );
  assert.equal(
    coerceDeskTicketAction({ type: "train", kind: "Schulung", summary: "" }, "Bitte keinen Termin buchen.").type,
    "train",
  );
  assert.equal(
    coerceDeskTicketAction({ type: "emergency", kind: "Notfall", summary: "" }, "Bitte keinen Termin buchen.").type,
    "emergency",
  );
  const deniedSpoken = alignSpokenDeskTicket(
    "Gebucht, 15 Uhr.",
    { type: "book", kind: "Termin", summary: "Slot" },
    "Bitte keinen Termin buchen.",
  );
  assert.equal(deniedSpoken.action.type, "none");
  assert.equal(deniedSpoken.action.kind, "Info");
  assert.equal(deniedSpoken.text, "Ich buche keinen Termin. Wobei kann ich Ihnen sonst helfen?");
  assert.doesNotMatch(deniedSpoken.text, /gebucht|15 Uhr/i);
  const callbackSpoken = alignSpokenDeskTicket(
    "Gebucht, 15 Uhr.",
    { type: "book", kind: "Termin", summary: "Slot" },
    "Bitte keinen Termin buchen, nur zurückrufen.",
  );
  assert.equal(callbackSpoken.action.type, "none");
  assert.equal(callbackSpoken.action.kind, "Rückruf");
  assert.match(callbackSpoken.text, /Rückrufzettel/i);
});

test("spoken Rückruf copy drops a invented slot time", () => {
  const user = "Bitte rufen Sie mich unter 0316 55 44 33 zurück, ich bin Frau Moser";
  const nameless = { type: "book", kind: "Termin", summary: "Slot", owner: "Frau Moser", pet: "Patient" };
  assert.equal(looksLikeBookedSlotSpeech("Ich lege Dienstag, 25.8. um 15:00."), true);
  assert.equal(
    looksLikeBookedSlotSpeech("Ich lege einen Rückrufzettel auf die Kassa. Jemand ruft Sie zurück."),
    false,
  );
  const swapped = alignSpokenDeskTicket(
    "Gerne, ich lege Dienstag um 15:00 für Sie. Bitte Impfpass mitnehmen.",
    nameless,
    user,
  );
  assert.equal(swapped.action.type, "none");
  assert.equal(swapped.action.kind, "Rückruf");
  assert.equal(swapped.text, callbackSpoken(nameless));
  assert.match(swapped.text, /Ihren Namen habe ich notiert/);
  assert.doesNotMatch(swapped.text, /Tier habe ich notiert/);
  assert.doesNotMatch(swapped.text, /\d{1,2}:\d{2}/);
  const keep = alignSpokenDeskTicket(
    CALLBACK_SPOKEN,
    { type: "none", kind: "Rückruf", summary: "Rückrufbitte", owner: "Frau Moser", pet: "Patient" },
    user,
  );
  assert.equal(keep.text, callbackSpoken({ owner: "Frau Moser", pet: "Patient" }));
  const realBook = alignSpokenDeskTicket(
    "Ich lege Dienstag um 15:00 für Nala Impfung.",
    { type: "book", kind: "Impfung", summary: "", owner: "Frau Berger", pet: "Nala" },
    "Termin für Nala Impfung",
  );
  assert.equal(realBook.action.type, "book");
  assert.match(realBook.text, /15:00/);
  const kassa = alignSpokenDeskTicket(
    "Ich lege 08:00, bleiben Sie in der Leitung.",
    { type: "book", kind: "Termin", summary: "", owner: "Frau Berger", pet: "Nala" },
    "Verbinden Sie mich mit der Kassa wegen Nala",
  );
  assert.equal(kassa.action.kind, "Kassa");
  assert.equal(kassa.text, KASSA_SPOKEN);
  assert.match(kassa.text, /Tierarzthelferin/);
  assert.doesNotMatch(kassa.text, /Kassa/);
  const kassaNoConnect = alignSpokenDeskTicket(
    "Ich kann Sie nicht direkt verbinden, aber ich lege einen Rückrufzettel an die Kassa für Sie.",
    { type: "none", kind: "Kassa", summary: "An die Kassa übergeben", owner: "Frau Quell", pet: "Patient" },
    "Verbinden Sie mich bitte mit der Kassa, ich bin Frau Quell",
  );
  assert.equal(kassaNoConnect.text, KASSA_SPOKEN);
  assert.doesNotMatch(kassaNoConnect.text, /nicht direkt verbinden|Rückrufzettel/);
  const settingsLeak = alignSpokenDeskTicket(
    "Die Nummer für den Rückruf fehlt in den Einstellungen. Bitte bleiben Sie kurz in der Leitung, ich lege einen Rückrufzettel an die Kassa.",
    { type: "none", kind: "Rückruf", summary: "Rückrufbitte", owner: "Frau Spoken", pet: "Patient" },
    "Bitte rufen Sie mich unter 0664 22 33 44 zurück, ich bin Frau Spoken",
  );
  assert.equal(settingsLeak.text, callbackSpoken({ owner: "Frau Spoken", pet: "Patient" }));
  assert.doesNotMatch(settingsLeak.text, /Einstellungen/);
  assert.doesNotMatch(settingsLeak.text, /Name und Tier/);
});

test("spoken Rückruf claims a pet only when one was named", () => {
  assert.equal(
    callbackSpoken({ owner: "Frau Moser", pet: "Nala" }),
    CALLBACK_SPOKEN,
  );
  assert.match(callbackSpoken({ owner: "Frau Moser", pet: "Patient" }), /Ihren Namen habe ich notiert/);
  assert.doesNotMatch(callbackSpoken({ owner: "Frau Moser", pet: "Patient" }), /Tier habe ich notiert/);
  assert.doesNotMatch(callbackSpoken({ owner: "Klientel", pet: "Patient" }), /notiert/);
  assert.match(callbackSpoken({ owner: "Klientel", pet: "Momo" }), /Das Tier habe ich notiert/);
  const withPet = alignSpokenDeskTicket(
    "Ich lege 15:00.",
    { type: "book", kind: "Rückruf", summary: "", owner: "Frau Berger", pet: "Nala" },
    "Bitte rufen Sie mich zurück, ich bin Frau Berger, Nala ist lahm",
  );
  assert.equal(withPet.text, CALLBACK_SPOKEN);
});

test("a Kassa handover with name still lands on the board", () => {
  assert.equal(isKassaTransferTurn("Kassa", "Hallo"), true);
  assert.equal(isKassaTransferTurn("", "Verbinden Sie mich mit der Kassa wegen Nala"), true);
  assert.equal(isKassaTransferTurn("", "Verbinden Sie mich mit der Tierarzthelferin"), true);
  assert.equal(isKassaTransferTurn("", "Ich möchte mit jemandem sprechen"), true);
  assert.equal(isKassaTransferTurn("Info", "Ist die Kassa offen?"), false);
  assert.equal(isKassaTransferTurn("", "Ist am Dienstag offen?"), false);
  assert.equal(isContactOnlyTurn("none", "Verbinden Sie mich, ich bin Frau Berger, 0664 123 45 67"), false);
  assert.equal(
    isHandyOnlyTurn("none", "Bitte verbinden Sie mich mit der Kassa, ich bin Frau Berger"),
    false,
  );
});
