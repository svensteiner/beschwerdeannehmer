import assert from "node:assert/strict";
import { test } from "node:test";
import {
  internContactMatchPets,
  internProtocolPet,
  mailtoHref,
  emergencyBoardAction,
  emergencyDeskLead,
  emergencyToast,
  nachtdienstDraft,
  nachtdienstReachCopy,
  nachtdienstReachHrefs,
  protocolBody,
  protocolContactFollowUp,
  protocolContactLines,
  protocolSubject,
  smsHref,
  walkInAction,
  whatsappHref,
} from "./protocol.ts";

const emptyAction = {
  type: "none" as const,
  owner: "Klientel",
  pet: "Patient",
  kind: "Anliegen",
  concern: "Frage zu Öffnungszeiten",
  summary: "",
};

test("phone protocol stays on Telefon unless a channel is set", () => {
  const body = protocolBody({
    action: { ...emptyAction, type: "book", pet: "Nala", owner: "Berger", kind: "Impfung" },
    user: "Termin für Nala",
    reply: "Ich lege 15:00.",
    akte: null,
    slot: "Dienstag, 25.8. um 15:00",
  });
  assert.match(body, /Kanal: Telefon/);
  assert.match(body, /Aktion: Impfung · Dienstag, 25.8. um 15:00/);
  assert.equal(protocolSubject({ ...emptyAction, type: "book", pet: "Nala", owner: "Berger" }), "Termin: Nala · Berger");
});

test("Uhrzeitwunsch bleibt ein sichtbarer Hinweis und kein Termin", () => {
  const action = { ...emptyAction, kind: "Terminwunsch", pet: "Nala", owner: "Frau Berger" };
  const body = protocolBody({
    action,
    user: "Morgen um 10 Uhr wäre gut.",
    reply: "Die Tierarzthelferin prüft den Wunsch.",
    akte: null,
  });

  assert.match(body, /Uhrzeitwunsch für die Tierarzthelferin prüfen/);
  assert.doesNotMatch(body, /Auskunft/);
  assert.equal(protocolSubject(action), "Terminwunsch: Nala · Frau Berger");
});

test("walk-in protocol is Tafel, intern subject names the slot", () => {
  const action = walkInAction({ owner: "Frau Berger", pet: "Nala", kind: "Kontrolle" });
  assert.equal(action.type, "book");
  assert.equal(action.kind, "Kontrolle");
  const body = protocolBody(
    {
      action,
      user: "Walk-in Kontrolle für Nala",
      reply: "An der Tafel gelegt: Dienstag, 25.8. um 15:00.",
      akte: null,
      slot: "Dienstag, 25.8. um 15:00",
      channel: "Tafel",
    },
    { practiceName: "Tierordination Murtal", owner: "Dr. Huber", nachtdienstName: "Nachtdienst" },
  );
  assert.match(body, /Kanal: Tafel/);
  assert.match(body, /An: Dr. Huber/);
  assert.match(body, /Halter: Frau Berger/);
  assert.doesNotMatch(body, /Handy:/);
  assert.doesNotMatch(body, /E-Mail:/);
  assert.match(body, /Aktion: Kontrolle · Dienstag, 25.8. um 15:00/);
  assert.doesNotMatch(body, /Kanal: Telefon/);
  assert.equal(protocolSubject(action), "Termin: Nala · Frau Berger");
});

test("callback protocol is a Rückrufzettel, not a generic Auskunft", () => {
  const action = {
    ...emptyAction,
    kind: "Rückruf",
    pet: "Nala",
    owner: "Frau Berger",
    concern: "Bitte zurückrufen",
    summary: "Rückrufbitte",
  };
  const body = protocolBody({
    action,
    user: "Bitte unter 0664 123 45 67 zurückrufen, Nala, Frau Berger",
    reply: "Ich lege einen Rückrufzettel auf die Kassa.",
    akte: null,
  });
  assert.match(body, /Aktion: Rückrufzettel für die Tierarzthelferin/);
  assert.doesNotMatch(body, /Auskunft/);
  assert.equal(protocolSubject(action), "Rückruf: Nala · Frau Berger");
});

test("kassa handover protocol is a desk ticket, not a generic Auskunft", () => {
  const action = {
    ...emptyAction,
    kind: "Kassa",
    pet: "Nala",
    owner: "Frau Berger",
    concern: "Verbinden Sie mich mit der Kassa",
    summary: "An die Kassa übergeben",
  };
  const body = protocolBody({
    action,
    user: "Verbinden Sie mich mit der Kassa wegen Nala, ich bin Frau Berger",
    reply: "Ich verbinde Sie mit der Kassa. Einen Moment, bleiben Sie in der Leitung.",
    akte: null,
  });
  assert.match(body, /Aktion: An die Tierarzthelferin übergeben/);
  assert.doesNotMatch(body, /Auskunft/);
  assert.equal(protocolSubject(action), "Übergabe: Nala · Frau Berger");
});

test("nameless Rückruf intern names the Halterin, not Patient", () => {
  const action = {
    ...emptyAction,
    kind: "Rückruf",
    pet: "Patient",
    owner: "Klientel Zettel",
    concern: "Bitte zurückrufen",
    summary: "Rückrufbitte",
  };
  assert.equal(protocolSubject(action), "Rückruf: Zettel");
  assert.equal(internProtocolPet(action.pet, action.owner), "Zettel");
  assert.equal(internProtocolPet("Nala", "Klientel Berger"), "Nala");
  assert.equal(internProtocolPet("Protokoll", ""), "Protokoll");
  assert.equal(internProtocolPet("Nummer", "Klientel"), "Protokoll");
  assert.equal(internProtocolPet("Handy", "Frau Berger"), "Frau Berger");
  assert.deepEqual(internContactMatchPets("", ""), ["Protokoll", "Patient"]);
  assert.deepEqual(internContactMatchPets("Patient", "Klientel"), ["Protokoll", "Patient"]);
  assert.deepEqual(internContactMatchPets("Patient", "Klientel Berger"), ["Berger", "Protokoll", "Patient"]);
  assert.deepEqual(internContactMatchPets("Nala", "Frau Berger"), ["Nala"]);
  const body = protocolBody({
    action,
    user: "Bitte unter 0664 77 88 99 zurückrufen, ich bin Frau Zettel",
    reply: "Ich lege einen Rückrufzettel auf die Kassa.",
    akte: null,
  });
  assert.match(body, /Tier: nicht genannt/);
  assert.doesNotMatch(body, /Tier: Patient/);
  assert.match(body, /Aktion: Rückrufzettel für die Tierarzthelferin/);
});

test("protocol names Halterin Handy and E-Mail, never the practice inbox", () => {
  const body = protocolBody({
    action: { ...emptyAction, type: "book", pet: "Beppo", owner: "Klientel", kind: "Impfung" },
    user: "Termin für Beppo",
    reply: "Ich lege 08:00.",
    akte: null,
    slot: "Mittwoch, 26.8. um 08:00",
    ownerPhone: "0664 181 20 08",
    ownerEmail: "Nowak@Example.com",
  });
  assert.match(body, /Handy: 0664 181 20 08/);
  assert.match(body, /E-Mail: nowak@example.com/);
  assert.doesNotMatch(body, /rezeption@/);
  assert.equal(protocolContactLines("", "kein-at").join(""), "");
  assert.equal(protocolContactLines("0316 12 34 56", "").join("\n"), "Telefon: 0316 12 34 56");
  assert.doesNotMatch(protocolContactLines("0316 12 34 56", "").join("\n"), /Handy:/);
  const follow = protocolContactFollowUp({
    pet: "Beppo",
    phone: "",
    email: "nowak@example.com",
    practiceName: "Tierordination Lenz",
  });
  assert.match(follow, /Kontakt nachgetragen für Beppo/);
  assert.match(follow, /E-Mail: nowak@example.com/);
  assert.doesNotMatch(follow, /Handy:/);
});

test("Nachtdienst hrefs go to the hinterlegte number, never the Halterin", () => {
  const hrefs = nachtdienstReachHrefs("+43 1 25077-5555", "Notfall – bitte übernehmen. Silvia, Ordination LlmQuelle.");
  assert.equal(hrefs.call, "tel:+431250775555");
  assert.match(hrefs.sms, /^sms:\+431250775555/);
  assert.equal(hrefs.wa, "");
  assert.equal(hrefs.call.includes("0664"), false);
  const handy = nachtdienstReachHrefs("0664 55 66 91", "Notfall");
  assert.match(handy.wa, /^https:\/\/wa\.me\/43664556691/);
  const graz = nachtdienstReachHrefs("0316 80 12 34", "Notfall");
  assert.equal(graz.call, "tel:+43316801234");
  assert.match(graz.sms, /^sms:\+43316801234/);
  assert.equal(graz.wa, "");
  assert.match(nachtdienstReachCopy("0316 80 12 34"), /Festnetz/);
  assert.doesNotMatch(nachtdienstReachCopy("0316 80 12 34"), /WhatsApp gehen/);
  assert.match(nachtdienstReachCopy("0316 80 12 34"), /braucht/);
  assert.match(nachtdienstReachCopy("0664 55 66 91"), /WhatsApp gehen/);
  assert.doesNotMatch(nachtdienstReachCopy("0316 80 12 34", true), /braucht|hinterlegen/);
  assert.doesNotMatch(nachtdienstReachCopy("", true), /hinterlegen/);
  assert.match(nachtdienstReachCopy("", true), /Leitung/);
  assert.match(nachtdienstReachCopy("0664 55 66 91", true), /WhatsApp gehen/);
  const empty = nachtdienstReachHrefs("", "Notfall");
  assert.equal(empty.call, "");
  assert.equal(empty.sms, "");
  assert.equal(empty.wa, "");
});

test("protocol hrefs stay empty without a destination, never Huber", () => {
  assert.equal(whatsappHref("Protokoll"), "");
  assert.equal(smsHref("Protokoll"), "");
  assert.equal(mailtoHref("Betreff", "Text"), "");
  assert.equal(whatsappHref("Protokoll", "").includes("436641812008"), false);
  assert.equal(mailtoHref("Betreff", "Text", "").includes("rezeption@huber.vet"), false);
  assert.match(whatsappHref("Protokoll", "0664 98 76 54"), /^https:\/\/wa\.me\/43664987654/);
  assert.match(smsHref("Protokoll", "0316 12 34 56"), /^sms:\+43316123456/);
  assert.match(mailtoHref("Betreff", "Text", "kassa@ordination.at"), /^mailto:kassa@ordination\.at/);
});

test("live emergency copy stays on the Tafel, not a PSTN connect", () => {
  assert.equal(emergencyBoardAction("Nachtklinik Graz", true), "Nachtdienst auf der Tafel · Nachtklinik Graz");
  assert.equal(emergencyBoardAction("Nachtklinik Graz", false), "Notfall erkannt · Nachtklinik Graz (Nummer fehlt)");
  assert.equal(emergencyBoardAction("", true), "Nachtdienst auf der Tafel · Nachtdienst");
  assert.equal(emergencyToast(true), "Notfall – Nachtdienst liegt auf der Tafel.");
  assert.equal(emergencyToast(false), "Notfall – Nachtdienst-Nummer fehlt.");
  assert.equal(emergencyDeskLead(), "Der Notfall liegt auf der Tafel.");
  assert.doesNotMatch(emergencyBoardAction("Nachtklinik Graz", true), /verbunden/i);
  assert.doesNotMatch(emergencyToast(true), /verbunden/i);
  assert.doesNotMatch(emergencyDeskLead(), /übergeben|verbunden/i);
});

test("Nachtdienst draft names the pet when Silvia already has it", () => {
  assert.equal(
    nachtdienstDraft({ practiceName: "Tafel Wien", pet: "Mizzi" }),
    "Notfall Mizzi – bitte übernehmen. Silvia, Tafel Wien.",
  );
  assert.equal(
    nachtdienstDraft({ practiceName: "Tafel Wien" }),
    "Notfall – bitte übernehmen. Silvia, Tafel Wien.",
  );
  assert.equal(
    nachtdienstDraft({ practiceName: "", pet: "Patient" }),
    "Notfall – bitte übernehmen. Silvia, Ordination.",
  );
});
