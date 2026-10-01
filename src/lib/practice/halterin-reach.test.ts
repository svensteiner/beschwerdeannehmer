import assert from "node:assert/strict";
import { test } from "node:test";
import { HALTERIN_REACH_OPEN_LABEL, halterinReachDomIds, halterinReachHrefs } from "./halterin-reach.ts";

test("Halterin SMS and WhatsApp stay closed without Handy, never the practice line", () => {
  const none = halterinReachHrefs({
    ownerPhone: "",
    ownerEmail: "",
    body: "Termin für Momo liegt.",
    mailSubject: "Wegen Momo · Tafel",
  });
  assert.equal(none.call, "");
  assert.equal(none.sms, "");
  assert.equal(none.wa, "");
  assert.equal(none.mail.startsWith("mailto:?subject="), true);
  assert.equal(none.mail.includes("01 405"), false);
  assert.equal(none.mail.includes("rezeption@"), false);

  const withMail = halterinReachHrefs({
    ownerPhone: "   ",
    ownerEmail: "nowak@example.com",
    body: "Termin für Momo liegt.",
    mailSubject: "Wegen Momo · Tafel",
  });
  assert.equal(withMail.sms, "");
  assert.equal(withMail.wa, "");
  assert.equal(withMail.call, "");
  assert.equal(withMail.mail.startsWith("mailto:nowak@example.com?"), true);

  const intern = halterinReachHrefs({
    ownerPhone: "",
    body: "Intern an die Frau Doktor",
  });
  assert.equal(intern.mail, "");
  assert.equal(intern.sms, "");

  const handy = halterinReachHrefs({
    ownerPhone: "0664 181 20 08",
    ownerEmail: "nowak@example.com",
    body: "Termin für Momo liegt.",
    mailSubject: "Wegen Momo · Tafel",
  });
  assert.equal(handy.call, "tel:+436641812008");
  assert.match(handy.sms, /^sms:\+436641812008\?body=/);
  assert.match(handy.wa, /^https:\/\/wa\.me\/436641812008\?text=/);
  assert.equal(handy.sms.includes("014051288"), false);
  assert.equal(handy.wa.includes("014051288"), false);
  assert.equal(HALTERIN_REACH_OPEN_LABEL, "Halterin erreichen");

  const festnetz = halterinReachHrefs({
    ownerPhone: "0316 12 34 56",
    ownerEmail: "",
    body: "Termin für Momo liegt.",
  });
  assert.equal(festnetz.call, "tel:+43316123456");
  assert.match(festnetz.sms, /^sms:\+43316123456\?body=/);
  assert.equal(festnetz.wa, "");
});

test("Halterin reach inner buttons keep stable ids from the opener, never invent Huber", () => {
  assert.deepEqual(halterinReachDomIds("heute-reach-slot1"), {
    tel: "heute-reach-slot1-tel",
    sms: "heute-reach-slot1-sms",
    wa: "heute-reach-slot1-wa",
    mail: "heute-reach-slot1-mail",
    close: "heute-reach-slot1-schliessen",
  });
  assert.deepEqual(halterinReachDomIds("heute-rueckruf-reach-c1"), {
    tel: "heute-rueckruf-reach-c1-tel",
    sms: "heute-rueckruf-reach-c1-sms",
    wa: "heute-rueckruf-reach-c1-wa",
    mail: "heute-rueckruf-reach-c1-mail",
    close: "heute-rueckruf-reach-c1-schliessen",
  });
  assert.deepEqual(halterinReachDomIds(""), {});
  assert.deepEqual(halterinReachDomIds("  "), {});
  assert.deepEqual(halterinReachDomIds(undefined), {});
  assert.equal(JSON.stringify(halterinReachDomIds("heute-reach-x")).includes("014051288"), false);
  assert.equal(JSON.stringify(halterinReachDomIds("heute-reach-x")).includes("huber"), false);
});
