import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cancelDraftToast,
  confirmDraftToast,
  confirmReachHint,
  lastUmlegenDraft,
  mailDraftHasTo,
  needsSilentConfirm,
  ownerReachBody,
  ownerReachMailSubject,
  parseLastUmlegen,
  reachTopic,
  ownerSlotMailSubject,
  emailForPet,
  contactForWalkInLast,
  parseLastWalkIn,
  phoneForPet,
  readLastUmlegen,
  readLastWalkIn,
  liveLineConfirmDraft,
  liveLineKassaDraft,
  liveLineReachDraft,
  confirmAfterContactFollowUp,
  pickConfirmSlotAfterContact,
  skipInternAfterConfirmFollowUp,
  reachAfterContactFollowUp,
  umlegenDraftToast,
  umlegenMailHref,
  umlegenSmsHref,
  umlegenWaHref,
  walkInCancelMailHref,
  walkInCancelSmsHref,
  walkInConfirmHref,
  walkInConfirmMailHref,
  walkInConfirmSmsHref,
  writeLastUmlegen,
  writeLastWalkIn,
} from "./walk-in-last.ts";

test("Kontakt ohne eindeutigen Terminbezug wird nicht zugeordnet", () => {
  const slots = [
    { id: "one", pet: "Patient", owner: "Klientel", startAt: "2026-09-13T08:00:00Z" },
    { id: "two", pet: "Patient", owner: "Klientel", startAt: "2026-09-13T09:00:00Z" },
  ];
  assert.equal(pickConfirmSlotAfterContact({ slots }), null);
  assert.equal(pickConfirmSlotAfterContact({ confirmId: "missing", slots }), null);
  const named = [{ ...slots[0], pet: "Nala", owner: "Frau Test" }];
  assert.equal(pickConfirmSlotAfterContact({ confirmId: "missing", pet: "Nala", slots: named }), null);
  assert.equal(pickConfirmSlotAfterContact({ confirmId: "one", pet: "Bella", slots: named }), null);
  assert.equal(pickConfirmSlotAfterContact({ confirmId: "one", pet: "Nala", owner: "Frau Test", slots: named })?.id, "one");
});

test("walk-in last persists id and pet, and rebuilds wa.me from the Akte Handy", () => {
  assert.equal(parseLastWalkIn(null), null);
  assert.equal(parseLastWalkIn({ id: "w-1" }), null);
  const last = parseLastWalkIn({ id: "w-1", pet: "Momo", owner: "Frau Nowak", href: "" });
  assert.equal(last?.id, "w-1");
  assert.equal(last?.pet, "Momo");
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  writeLastWalkIn(memory, last);
  assert.equal(readLastWalkIn(memory)?.pet, "Momo");
  writeLastWalkIn(memory, null);
  assert.equal(readLastWalkIn(memory), null);
});

test("confirm href is wa.me to the Halterin with the slot, never the practice line", () => {
  const href = walkInConfirmHref({
    phone: "0664 181 20 08",
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
  });
  assert.match(href, /^https:\/\/wa\.me\/436641812008\?text=/);
  assert.match(decodeURIComponent(href), /Momo/);
  assert.match(decodeURIComponent(href), /15:00/);
  assert.equal(
    walkInConfirmHref({ phone: "", pet: "Momo", startAt: "2026-08-27T15:00:00", practiceName: "Tafel" }),
    "",
  );
  assert.equal(
    walkInConfirmHref({ phone: "0316 12 34 56", pet: "Momo", startAt: "2026-08-27T15:00:00", practiceName: "Tafel Graz" }),
    "",
  );
  const festnetzSms = walkInConfirmSmsHref({
    phone: "0316 12 34 56",
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Graz",
  });
  assert.match(festnetzSms, /^sms:\+43316123456\?body=/);
  const sms = walkInConfirmSmsHref({
    phone: "0664 181 20 08",
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
  });
  assert.match(sms, /^sms:\+436641812008\?body=/);
  assert.match(decodeURIComponent(sms), /Momo/);
  assert.equal(
    walkInConfirmSmsHref({ phone: "", pet: "Momo", startAt: "2026-08-27T15:00:00", practiceName: "Tafel" }),
    "",
  );
  assert.equal(confirmDraftToast("sms"), "Bestätigt. SMS an die Halterin ist offen.");
  const cancelSms = walkInCancelSmsHref({
    phone: "0664 181 20 08",
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
  });
  assert.match(cancelSms, /^sms:\+436641812008\?body=/);
  assert.match(decodeURIComponent(cancelSms), /fällt aus/);
  assert.equal(
    walkInCancelSmsHref({ phone: "", pet: "Momo", startAt: "2026-08-27T15:00:00", practiceName: "Tafel" }),
    "",
  );
  assert.equal(cancelDraftToast("sms"), "Abgesagt. SMS an die Halterin ist offen.");
  assert.equal(ownerSlotMailSubject("termin", "Momo", "Tafel Handy"), "Termin Momo · Tafel Handy");
  assert.equal(ownerSlotMailSubject("absage", "Momo", "Tafel Handy"), "Termin Momo fällt aus · Tafel Handy");
  assert.equal(ownerSlotMailSubject("termin", "Patient", "Tafel", "Frau Wallner"), "Termin Frau Wallner · Tafel");
  assert.equal(ownerSlotMailSubject("absage", "Patient", "Tafel", "Frau Wallner"), "Termin Frau Wallner fällt aus · Tafel");
  assert.equal(ownerSlotMailSubject("termin", "Patient", "Tafel", "Klientel"), "Termin · Tafel");
  const namelessWa = walkInConfirmHref({
    phone: "0664 55 69 78",
    pet: "Patient",
    owner: "Frau Wallner",
    startAt: "2026-08-31T08:30:00",
    practiceName: "Tafel Graz",
  });
  assert.match(decodeURIComponent(namelessWa), /Frau Wallner/);
  assert.equal(decodeURIComponent(namelessWa).includes("Patient"), false);
  assert.equal(ownerReachMailSubject("Momo", "Tafel Handy"), "Wegen Momo · Tafel Handy");
  assert.equal(ownerReachMailSubject("", ""), "Wegen Ihrem Anliegen · Ordination");
  assert.equal(ownerReachMailSubject("Patient", "Tafel", "Klientel Berger"), "Wegen Berger · Tafel");
  assert.equal(reachTopic("Patient", "Frau Berger"), "Frau Berger");
  assert.equal(reachTopic("Nala", "Frau Berger"), "Nala");
  assert.equal(reachTopic("Nummer", "Klientel"), "Ihrem Anliegen");
  assert.equal(reachTopic("Nummer", "Frau Berger"), "Frau Berger");
  assert.match(ownerReachBody({ pet: "Patient", caller: "Frau Berger", practiceName: "Tafel", kind: "rueckruf" }), /Wegen Frau Berger rufe ich zurück/);
  assert.equal(ownerReachBody({ pet: "Patient", caller: "Frau Berger", practiceName: "Tafel", kind: "rueckruf" }).includes("Wegen Patient"), false);
  const reach = liveLineReachDraft({
    id: "c-nameless",
    pet: "Patient",
    owner: "Frau Nameless",
    phone: "0664 77 88 99",
    email: "",
    practiceName: "Tafel Graz Spoken",
  });
  assert.equal(reach?.id, "c-nameless");
  assert.match(reach?.body ?? "", /Wegen Frau Nameless rufe ich zurück/);
  assert.equal((reach?.body ?? "").includes("Wegen Patient"), false);
  assert.equal(reach?.mailSubject, "Wegen Frau Nameless · Tafel Graz Spoken");
  assert.equal(liveLineReachDraft({ id: "", pet: "Nala", owner: "Frau Berger", practiceName: "Tafel" }), null);
  const afterHandy = reachAfterContactFollowUp({
    call: { id: "c-rueck", caller: "Klientel", pet: "Patient" },
    phone: "0664 55 66 78",
    owner: "Klientel Spoken",
    practiceName: "Tafel Graz",
  });
  assert.equal(afterHandy?.id, "c-rueck");
  assert.equal(afterHandy?.phone, "0664 55 66 78");
  assert.match(afterHandy?.body ?? "", /Spoken|zurück/);
  assert.equal(
    reachAfterContactFollowUp({
      call: { id: "c-rueck", caller: "Klientel", pet: "Patient" },
      practiceName: "Tafel Graz",
    }),
    null,
  );
  assert.equal(
    reachAfterContactFollowUp({
      inbound: true,
      call: { id: "c-rueck", caller: "Klientel", pet: "Patient" },
      phone: "0664 55 66 78",
      practiceName: "Tafel Graz",
    }),
    null,
  );
  const namelessSlot = {
    id: "b-eder",
    pet: "Patient",
    owner: "Klientel",
    startAt: "2026-08-31T08:00:00.000Z",
  };
  const leftover = {
    id: "w-leftover",
    pet: "Patient",
    owner: "Frau Leitgeb",
    startAt: "2026-08-31T10:00:00.000Z",
  };
  assert.equal(
    pickConfirmSlotAfterContact({
      confirmId: "b-eder",
      pet: "Patient",
      owner: "Klientel",
      slots: [leftover, namelessSlot],
    })?.id,
    "b-eder",
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      pet: "Patient",
      owner: "Frau Eder",
      slots: [leftover, namelessSlot],
    }),
    null,
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      pet: "Resi",
      slots: [
        leftover,
        { id: "b-resi", pet: "Resi", owner: "Frau Berger", startAt: namelessSlot.startAt },
      ],
    })?.id,
    "b-resi",
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      pet: "Patient",
      slots: [leftover],
    }),
    null,
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      pet: "Resi",
      slots: [
        { id: "b-resi-a", pet: "Resi", owner: "Frau Berger", startAt: namelessSlot.startAt },
        { id: "b-resi-b", pet: "Resi", owner: "Frau Prinz", startAt: namelessSlot.startAt },
      ],
    }),
    null,
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      confirmId: "b-resi-a",
      pet: "Resi",
      owner: "Frau Prinz",
      slots: [{ id: "b-resi-a", pet: "Resi", owner: "Frau Berger", startAt: namelessSlot.startAt }],
    }),
    null,
  );
  assert.equal(
    pickConfirmSlotAfterContact({
      confirmId: "missing",
      pet: "Bella",
      slots: [leftover, namelessSlot],
    }),
    null,
  );
  const afterHandyConfirm = confirmAfterContactFollowUp({
    slot: namelessSlot,
    phone: "0664 55 70 12",
    owner: "Frau Eder",
    practiceName: "Tafel Graz",
  });
  assert.equal(afterHandyConfirm?.id, "b-eder");
  assert.equal(afterHandyConfirm?.phone, "0664 55 70 12");
  assert.match(afterHandyConfirm?.href ?? "", /wa\.me\/43664557012/);
  assert.match(decodeURIComponent(afterHandyConfirm?.href ?? ""), /Frau Eder/);
  assert.equal(decodeURIComponent(afterHandyConfirm?.href ?? "").includes("Patient"), false);
  assert.equal(
    confirmAfterContactFollowUp({
      slot: namelessSlot,
      practiceName: "Tafel Graz",
    }),
    null,
  );
  assert.equal(
    confirmAfterContactFollowUp({
      inbound: true,
      slot: namelessSlot,
      phone: "0664 55 70 12",
      practiceName: "Tafel Graz",
    }),
    null,
  );
  const afterMail = confirmAfterContactFollowUp({
    slot: namelessSlot,
    email: "prinz.slot@example.com",
    owner: "Frau Prinz",
    practiceName: "Tafel Graz",
  });
  assert.equal(afterMail?.id, "b-eder");
  assert.equal(afterMail?.email, "prinz.slot@example.com");
  assert.equal(afterMail?.href, "");
  assert.equal(mailDraftHasTo(afterMail?.mailHref), true);
  assert.match(afterMail?.mailHref ?? "", /^mailto:prinz\.slot@example\.com\?/i);
  assert.match(decodeURIComponent(afterMail?.mailHref ?? ""), /Frau Prinz/);
  assert.equal(decodeURIComponent(afterMail?.mailHref ?? "").includes("Patient"), false);
  assert.equal(decodeURIComponent(afterMail?.mailHref ?? "").includes("huber"), false);
  assert.equal(skipInternAfterConfirmFollowUp({ confirm: afterMail }), true);
  assert.equal(skipInternAfterConfirmFollowUp({ confirm: afterHandyConfirm }), true);
  assert.equal(skipInternAfterConfirmFollowUp({ confirm: null }), false);
  assert.equal(skipInternAfterConfirmFollowUp({ inbound: true, confirm: afterMail }), true);
  const kassa = liveLineKassaDraft({
    id: "c-kassa",
    pet: "Nala",
    owner: "Frau Leitung",
    concern: "Verbinden Sie mich mit der Kassa",
  });
  assert.equal(kassa?.id, "c-kassa");
  assert.equal(kassa?.owner, "Frau Leitung");
  assert.equal(kassa?.pet, "Nala");
  assert.equal(kassa?.concern.includes("Kassa"), true);
  assert.equal(liveLineKassaDraft({ id: "", owner: "Frau Leitung" }), null);
  const mail = walkInConfirmMailHref({
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
  });
  assert.equal(mail.startsWith("mailto:?subject="), true);
  assert.match(decodeURIComponent(mail), /Momo/);
  assert.match(decodeURIComponent(mail), /15:00/);
  assert.equal(mail.includes("rezeption@"), false);
  assert.equal(mail.includes("kassa@"), false);
  const mailToHalterin = walkInConfirmMailHref({
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
    email: "nowak@example.com",
  });
  assert.equal(mailToHalterin.startsWith("mailto:nowak@example.com?"), true);
  const cancelMail = walkInCancelMailHref({
    pet: "Momo",
    startAt: "2026-08-27T15:00:00",
    practiceName: "Tafel Handy",
  });
  assert.equal(cancelMail.startsWith("mailto:?subject="), true);
  assert.match(decodeURIComponent(cancelMail), /fällt aus/);
  assert.equal(confirmDraftToast("mail"), "Bestätigt. E-Mail an die Halterin ist offen.");
  assert.equal(mailDraftHasTo("mailto:nowak@example.com?subject=Termin"), true);
  assert.equal(mailDraftHasTo("mailto:?subject=Termin"), false);
  assert.equal(mailDraftHasTo(""), false);
  assert.match(confirmReachHint({ href: "https://wa.me/43664", smsHref: "sms:+43664" }), /WhatsApp, SMS oder E-Mail/);
  assert.match(confirmReachHint({ href: "", smsHref: "sms:+43316" }), /WhatsApp braucht ein Handy/);
  assert.match(confirmReachHint({ href: "", smsHref: "", mailHref: "mailto:nowak@example.com?subject=Termin" }), /füllt To:/);
  assert.match(confirmReachHint({ href: "", smsHref: "", mailHref: "mailto:?subject=Termin" }), /leeren Empfänger/);
  assert.match(confirmReachHint({ href: "", smsHref: "", mailHref: "" }), /Kein Entwurf/);
  assert.equal(needsSilentConfirm({ href: "", smsHref: "", mailHref: "mailto:?subject=Termin" }), false);
  assert.equal(needsSilentConfirm({ href: "", smsHref: "", mailHref: "" }), true);
  assert.equal(needsSilentConfirm({ href: "https://wa.me/43", smsHref: "", mailHref: "" }), false);
  assert.equal(confirmDraftToast(""), "Termin bestätigt. Telefon in der Akte nachtragen.");
  assert.equal(cancelDraftToast("mail"), "Abgesagt. E-Mail an die Halterin ist offen.");
  assert.equal(phoneForPet([{ name: "Momo", phone: "06641812008" }], "momo"), "06641812008");
  assert.equal(phoneForPet([{ name: "Nala", phone: "0664" }], "Momo"), "");
  assert.equal(emailForPet([{ name: "Momo", email: "nowak@example.com" }], "momo"), "nowak@example.com");
  assert.equal(emailForPet([{ name: "Nala", email: "x@y.at" }], "Momo"), "");
  assert.equal(phoneForPet([{ name: "Patient", phone: "0664 11 11 11" }], "Patient"), "");
  assert.equal(emailForPet([{ name: "Nummer", email: "stolen@example.com" }], "Nummer"), "");

  const holzer = contactForWalkInLast({
    last: { id: "w-holzer", pet: "Patient", owner: "Frau Holzer" },
    slot: { owner_phone: "0664 55 70 23", owner_email: "holzer.tafel@example.com", owner_name: "Frau Holzer" },
    patients: [{ name: "Patient", owner_name: "Klientel", phone: "0664 11 11 11" }],
  });
  assert.equal(holzer.phone, "0664 55 70 23");
  assert.equal(holzer.email, "holzer.tafel@example.com");

  const ederAkte = contactForWalkInLast({
    last: { id: "w-eder", pet: "Patient", owner: "Frau Eder" },
    slot: { owner_name: "Frau Eder" },
    patients: [
      { name: "Patient", owner_name: "Klientel", phone: "0664 11 11 11", email: "stolen@example.com" },
      { name: "Patient", owner_name: "Frau Eder", phone: "0664 55 70 12", email: "eder.tafel@example.com" },
    ],
  });
  assert.equal(ederAkte.phone, "0664 55 70 12");
  assert.equal(ederAkte.email, "eder.tafel@example.com");

  const leftoverNoise = contactForWalkInLast({
    last: { id: "w-noise", pet: "Patient", owner: "Klientel" },
    slot: { owner_name: "Klientel" },
    patients: [{ name: "Patient", owner_name: "Klientel", phone: "0664 11 11 11", email: "stolen@example.com" }],
  });
  assert.equal(leftoverNoise.phone, "");
  assert.equal(leftoverNoise.email, "");

  const named = contactForWalkInLast({
    last: { id: "w-nala", pet: "Nala", owner: "Klientel" },
    patients: [{ name: "Nala", owner_name: "Frau Berger", phone: "0664 18 12 008", email: "berger@example.com" }],
  });
  assert.equal(named.phone, "0664 18 12 008");
  assert.equal(named.email, "berger@example.com");
});

test("live line confirm drafts go to the Halterin, never the practice, including nameless slots", () => {
  const startAt = "2026-08-27T13:00:00.000Z";
  const draft = liveLineConfirmDraft({
    id: "b-resi",
    pet: "Resi",
    owner: "Frau Berger",
    startAt,
    practiceName: "Ordination LlmQuelle",
    phone: "0664 181 20 08",
    email: "berger@example.com",
  });
  assert.equal(draft?.id, "b-resi");
  assert.equal(draft?.pet, "Resi");
  assert.match(draft?.href ?? "", /wa\.me\/436641812008/);
  assert.match(draft?.smsHref ?? "", /^sms:/);
  assert.match(draft?.mailHref ?? "", /mailto:berger@example\.com/i);
  assert.equal(draft?.phone, "0664 181 20 08");
  assert.equal((draft?.href ?? "").includes("0316"), false);
  const festnetz = liveLineConfirmDraft({
    id: "b-festnetz",
    pet: "Resi",
    owner: "Frau Berger",
    startAt,
    practiceName: "Ordination LlmQuelle",
    phone: "0316 12 34 56",
  });
  assert.equal(festnetz?.href, "");
  assert.match(festnetz?.smsHref ?? "", /^sms:\+43316123456/);
  const nameless = liveLineConfirmDraft({
    id: "b-kogler",
    pet: "Patient",
    owner: "Frau Kogler",
    startAt,
    practiceName: "Ordination LlmQuelle",
    phone: "0664 55 69 89",
    email: "kogler.slot@example.com",
  });
  assert.equal(nameless?.id, "b-kogler");
  assert.match(nameless?.href ?? "", /wa\.me\/43664556989/);
  assert.match(decodeURIComponent(nameless?.href ?? ""), /Frau Kogler/);
  assert.equal(decodeURIComponent(nameless?.href ?? "").includes("Patient"), false);
  const klientel = liveLineConfirmDraft({
    id: "b-x",
    pet: "Patient",
    owner: "Klientel",
    startAt,
    practiceName: "Ordination LlmQuelle",
    phone: "0664 181 20 08",
  });
  assert.equal(klientel?.id, "b-x");
  assert.match(decodeURIComponent(klientel?.href ?? ""), /Ihr Termin liegt/);
  assert.equal(decodeURIComponent(klientel?.href ?? "").includes("Patient"), false);
  assert.equal(liveLineConfirmDraft({
    id: "b-x",
    pet: "Resi",
    owner: "Frau Berger",
    startAt: "not-a-date",
    practiceName: "Ordination LlmQuelle",
  }), null);
});

test("umlegen drafts tell the Halterin the old and new slot, never the practice line", () => {
  const input = {
    id: "slot-nala",
    pet: "Nala",
    owner: "Frau Berger",
    previousStart: "2026-08-27T15:00:00",
    startAt: "2026-08-27T16:00:00",
    practiceName: "Tafel Handy",
    phone: "0664 181 20 08",
    email: "berger@example.com",
  };
  const href = umlegenWaHref(input);
  assert.match(href, /^https:\/\/wa\.me\/436641812008\?text=/);
  const waBody = decodeURIComponent(href.slice(href.indexOf("text=") + 5));
  assert.match(waBody, /Nala/);
  assert.match(waBody, /umgelegt/);
  assert.match(waBody, /15:00/);
  assert.match(waBody, /16:00/);
  assert.equal(waBody.includes("liegt:"), false);
  assert.equal(href.includes("0316"), false);
  assert.equal(umlegenWaHref({ ...input, phone: "" }), "");
  assert.equal(umlegenWaHref({ ...input, phone: "0316 12 34 56" }), "");
  const sms = umlegenSmsHref(input);
  assert.match(sms, /^sms:\+436641812008\?body=/);
  assert.match(decodeURIComponent(sms), /umgelegt/);
  assert.equal(umlegenSmsHref({ ...input, phone: "" }), "");
  assert.match(umlegenSmsHref({ ...input, phone: "0316 12 34 56" }), /^sms:\+43316123456/);
  const mail = umlegenMailHref(input);
  assert.equal(mail.startsWith("mailto:berger@example.com?"), true);
  assert.match(decodeURIComponent(mail), /umgelegt/);
  assert.equal(mail.includes("rezeption@"), false);
  const emptyMail = umlegenMailHref({ ...input, email: "" });
  assert.equal(emptyMail.startsWith("mailto:?subject="), true);
  assert.equal(ownerSlotMailSubject("umgelegt", "Nala", "Tafel Handy"), "Termin Nala umgelegt · Tafel Handy");
  assert.equal(ownerSlotMailSubject("umgelegt", "Patient", "Tafel"), "Termin umgelegt · Tafel");
  assert.equal(umlegenDraftToast("whatsapp"), "WhatsApp an die Halterin ist offen.");
  assert.equal(umlegenWaHref({ ...input, startAt: input.previousStart }), "");
  const last = lastUmlegenDraft(input);
  assert.equal(last?.id, "slot-nala");
  assert.equal(last?.href, href);
  assert.equal(parseLastUmlegen({ id: "x" }), null);
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  writeLastUmlegen(memory, last);
  assert.equal(readLastUmlegen(memory)?.pet, "Nala");
  writeLastUmlegen(memory, null);
  assert.equal(readLastUmlegen(memory), null);
  const noPet = lastUmlegenDraft({ ...input, pet: "Patient", phone: "0664 181 20 08" });
  assert.match(decodeURIComponent(noPet?.href ?? ""), /Frau Berger/);
  assert.equal(decodeURIComponent(noPet?.href ?? "").includes("Patient"), false);
  const namedOwner = lastUmlegenDraft({
    ...input,
    pet: "Patient",
    owner: "Frau Wallner",
    phone: "0664 181 20 08",
  });
  assert.match(decodeURIComponent(namedOwner?.href ?? ""), /Frau Wallner/);
  assert.equal(decodeURIComponent(namedOwner?.href ?? "").includes("Patient"), false);
  assert.equal(ownerSlotMailSubject("umgelegt", "Patient", "Tafel", "Frau Wallner"), "Termin Frau Wallner umgelegt · Tafel");
  const noName = lastUmlegenDraft({
    ...input,
    pet: "Patient",
    owner: "Klientel",
    phone: "0664 181 20 08",
  });
  assert.match(decodeURIComponent(noName?.href ?? ""), /Ihr Termin ist umgelegt/);
  assert.equal(decodeURIComponent(noName?.href ?? "").includes("Patient"), false);
});
