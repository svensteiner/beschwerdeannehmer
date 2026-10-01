import assert from "node:assert/strict";
import { test } from "node:test";
import {
  patientMatchesCallNeedles,
  pickPracticeKb,
  practiceKbNeedles,
  selectPracticeKb,
} from "./practice-kb.ts";

function stub(name: string, owner = "Klientel", chip = "", phone = "") {
  return { name, owner, chip, phone };
}

test("needles read Zorro, Frau Pichler, Chip and Handy from the spoken turn", () => {
  const zorro = practiceKbNeedles("Zorro braucht Impfung");
  assert.equal(zorro.pet, "zorro");
  assert.equal(practiceKbNeedles("Ist am Nationalfeiertag offen?").pet, "");
  assert.equal(practiceKbNeedles("Ich bin Felix, was kostet das?").pet, "");
  assert.equal(practiceKbNeedles("Wastl Impfung morgen").pet, "");
  assert.equal(practiceKbNeedles("Wastl braucht Impfung").pet, "wastl");
  assert.equal(practiceKbNeedles("Hier ist Frau Pichler").owner, "pichler");
  assert.equal(practiceKbNeedles("Pichler").owner, "");
  assert.equal(practiceKbNeedles("Chip 040098100888777").chip, "040098100888777");
  assert.equal(practiceKbNeedles("Bitte unter 0664 123 45 67 zurückrufen").phone, "06641234567");
});

test("Silvia finds Zorro past the old alphabetical 40, not only Ada…Anita", () => {
  const alpha = Array.from({ length: 45 }, (_, i) => stub(`Ada-${String(i).padStart(2, "0")}`));
  const zorro = stub("Zorro", "Frau Nowak", "040099900000001", "06649876543");
  const kb = selectPracticeKb([...alpha, zorro], "Zorro braucht Impfung");
  assert.equal(kb.length, 1);
  assert.equal(kb[0]?.name, "Zorro");
  assert.equal(kb[0]?.owner, "Frau Nowak");
  assert.equal(
    patientMatchesCallNeedles(zorro, practiceKbNeedles("Zorro braucht Impfung")),
    true,
  );
  assert.equal(
    patientMatchesCallNeedles(alpha[0]!, practiceKbNeedles("Zorro braucht Impfung")),
    false,
  );
});

test("unnamed turn sends no Akten until a pet or Halterin is named", () => {
  const rows = Array.from({ length: 40 }, (_, i) => stub(`Nala-${i}`));
  const kb = selectPracticeKb(rows, "Grüß Gott, haben Sie heute offen?");
  assert.equal(kb.length, 0);
});

test("pickPracticeKb prefers the named hit and drops duplicates", () => {
  const named = [stub("Zorro", "Nowak", "1")];
  const recent = [stub("Ada", "A", "2"), stub("Zorro", "Nowak", "1"), stub("Beppo", "B", "3")];
  assert.deepEqual(
    pickPracticeKb(named, recent, 2).map((p) => p.name),
    ["Zorro", "Ada"],
  );
});
