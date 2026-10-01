import assert from "node:assert/strict";
import { test } from "node:test";
import { mailMatchesNeedle, protocolSearchNeedle, threadMatchesNeedle } from "./protocol-query.ts";

test("Protokoll search matches thread name, pet, preview, handy, and mail body", () => {
  assert.equal(protocolSearchNeedle("  Zorro%_  "), "zorro");
  const zorroThread = {
    name: "Dr. Protokoll · intern",
    pet: "Zorro",
    preview: "Termin Impfung gelegt",
    owner_phone: "0664 987 65 43",
    owner_email: "nowak@example.com",
    messages: [{ text: "Zorro braucht die Jahresimpfung" }],
  };
  const nalaThread = {
    name: "Frau Berger · intern",
    pet: "Nala",
    preview: "Kontrolle",
    owner_phone: "0664 111 11 11",
    owner_email: "berger@example.com",
    messages: [{ text: "Nala hinkt seit gestern" }],
  };
  assert.equal(threadMatchesNeedle("zorro", zorroThread), true);
  assert.equal(threadMatchesNeedle("zorro", nalaThread), false);
  assert.equal(threadMatchesNeedle("jahresimpfung", zorroThread), true);
  assert.equal(threadMatchesNeedle("nowak@example.com", zorroThread), true);
  assert.equal(threadMatchesNeedle("nowak@", nalaThread), false);
  assert.equal(threadMatchesNeedle("0664 987", zorroThread), true);
  assert.equal(threadMatchesNeedle("nowak", zorroThread), true);
  const zorroMail = {
    subject: "Protokoll Silvia · Impfung",
    body: "Zorro, Frau Nowak, Donnerstag 15 Uhr",
    pet: "Zorro",
    to_addr: "praxis@example.at",
    owner_email: "nowak@example.com",
  };
  const nalaMail = {
    subject: "Protokoll Silvia · Kontrolle",
    body: "Nala kommt zur Kontrolle",
    pet: "Nala",
    to_addr: "praxis@example.at",
    owner_email: "berger@example.com",
  };
  assert.equal(mailMatchesNeedle("zorro", zorroMail), true);
  assert.equal(mailMatchesNeedle("zorro", nalaMail), false);
  assert.equal(mailMatchesNeedle("nowak", zorroMail), true);
  assert.equal(mailMatchesNeedle("nowak@example.com", zorroMail), true);
  assert.equal(mailMatchesNeedle("nowak@", nalaMail), false);
  assert.equal(mailMatchesNeedle("hinkt", zorroMail), false);
});
