import assert from "node:assert/strict";
import { test } from "node:test";
import { callMatchesNeedle, callSearchNeedle } from "./call-query.ts";

test("Anrufe search matches Halterin, Tier, Handy, and transcript, not a neighbor", () => {
  assert.equal(callSearchNeedle("  Zorro%_  "), "zorro");
  const zorro = {
    caller: "Frau Nowak",
    pet: "Zorro",
    concern: "Impfung",
    action: "Termin Impfung gelegt",
    owner_phone: "0664 987 65 43",
    owner_email: "nowak@example.com",
    transcript: [{ text: "Zorro braucht die Jahresimpfung" }],
  };
  const nala = {
    caller: "Frau Berger",
    pet: "Nala",
    concern: "Kontrolle",
    action: "Auskunft hinterlegt",
    owner_phone: "0664 111 11 11",
    owner_email: "berger@example.com",
    transcript: [{ text: "Nala hinkt seit gestern" }],
  };
  assert.equal(callMatchesNeedle("zorro", zorro), true);
  assert.equal(callMatchesNeedle("zorro", nala), false);
  assert.equal(callMatchesNeedle("nowak", zorro), true);
  assert.equal(callMatchesNeedle("nowak@example.com", zorro), true);
  assert.equal(callMatchesNeedle("nowak@", nala), false);
  assert.equal(callMatchesNeedle("0664 987", zorro), true);
  assert.equal(callMatchesNeedle("jahresimpfung", zorro), true);
  assert.equal(callMatchesNeedle("hinkt", zorro), false);
});
