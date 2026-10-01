import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupPatient, patientBlurb, type Patient } from "./patients.ts";

const bella: Patient = {
  chip: "123",
  name: "Bella",
  species: "Hund",
  breed: "",
  born: "",
  owner: "Sven",
  phone: "",
  lastVaccine: "",
  rabies: "",
  registered: false,
  notes: "",
};

test("demo lookup still finds Wastl", () => {
  assert.equal(lookupPatient("Wastl ist lahm")?.name, "Wastl");
  assert.equal(lookupPatient("Chip 040098100123456")?.owner, "Frau Leitner");
});

test("live lookup does not leak demo patients", () => {
  assert.equal(lookupPatient("Wastl ist lahm", [], { includeDemo: false }), null);
  assert.equal(lookupPatient("Bella", [bella], { includeDemo: false })?.owner, "Sven");
});

test("Aktenblurb omits empty Chip and Handy", () => {
  const text = patientBlurb([
    {
      ...bella,
      chip: "",
      phone: "",
    },
  ]);
  assert.match(text, /Bella/);
  assert.equal(/Chip/.test(text), false);
  assert.equal(/0664/.test(text), false);
});
