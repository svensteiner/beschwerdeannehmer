import assert from "node:assert/strict";
import { test } from "node:test";
import { emergencyMatchesNeedle, emergencySearchNeedle } from "./emergency-query.ts";

test("Notfall search matches pet, Halterin, summary, and handy, not a neighbor", () => {
  assert.equal(emergencySearchNeedle("  Mizzi%_  "), "mizzi");
  const mizzi = {
    owner_name: "Frau Huber",
    pet: "Mizzi",
    summary: "Katze atmet nicht, Blut",
    routed_to: "Tierspital der Vetmeduni Wien",
    species: "Katze",
    owner_phone: "0664 555 12 12",
    owner_email: "huber@example.com",
  };
  const zorro = {
    owner_name: "Frau Nowak",
    pet: "Zorro",
    summary: "Hund liegt und atmet nicht",
    routed_to: "Tierspital der Vetmeduni Wien",
    species: "Hund",
    owner_phone: "0664 987 65 43",
    owner_email: "nowak@example.com",
  };
  assert.equal(emergencyMatchesNeedle("mizzi", mizzi), true);
  assert.equal(emergencyMatchesNeedle("mizzi", zorro), false);
  assert.equal(emergencyMatchesNeedle("huber", mizzi), true);
  assert.equal(emergencyMatchesNeedle("huber@example.com", mizzi), true);
  assert.equal(emergencyMatchesNeedle("huber@", zorro), false);
  assert.equal(emergencyMatchesNeedle("atmet nicht", mizzi), true);
  assert.equal(emergencyMatchesNeedle("0664 555", mizzi), true);
  assert.equal(emergencyMatchesNeedle("zorro", mizzi), false);
});
