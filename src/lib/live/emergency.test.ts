import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { detectEmergency } from "./emergency.ts";

test("emergency detection: positive cases (>=15)", async (t) => {
  // Atemnot
  await t.test("detects Atemnot: bekommt keine Luft", () => {
    const result = detectEmergency("bekommt keine Luft");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "atemnot");
  });

  await t.test("detects Atemnot: Schnaufen", () => {
    const result = detectEmergency("Der Hund schnauft");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "atemnot");
  });

  // Blutung
  await t.test("detects Blutung: blutet stark", () => {
    const result = detectEmergency("blutet stark");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "blutung");
  });

  await t.test("detects Blutung: viel Blut", () => {
    const result = detectEmergency("viel Blut");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "blutung");
  });

  // Krampf
  await t.test("detects Krampf: Krampfanfall", () => {
    const result = detectEmergency("Krampfanfall");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "krampf");
  });

  // Unfall
  await t.test("detects Unfall: Auto angefahren", () => {
    const result = detectEmergency("Auto angefahren");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "unfall");
  });

  await t.test("detects Unfall: von Laster überfahren", () => {
    const result = detectEmergency("von Laster überfahren");
    strictEqual(result.emergency, true);
  });

  // Vergiftung
  await t.test("detects Vergiftung: hat Schokolade gefressen", () => {
    const result = detectEmergency("hat Schokolade gefressen");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "vergiftung");
  });

  await t.test("detects Vergiftung: Rattengift", () => {
    const result = detectEmergency("Rattengift");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "vergiftung");
  });

  // Kollaps
  await t.test("detects Kollaps: kippt um", () => {
    const result = detectEmergency("kippt um");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "kollaps");
  });

  await t.test("detects Kollaps: bewusstlos", () => {
    const result = detectEmergency("bewusstlos");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "kollaps");
  });

  // Geburt
  await t.test("detects Geburt: wirft Junge", () => {
    const result = detectEmergency("wirft Junge");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "geburt");
  });

  await t.test("detects Geburt: Welpen", () => {
    const result = detectEmergency("Welpen kommen");
    strictEqual(result.emergency, true);
  });

  // Hitzschlag
  await t.test("detects Hitzschlag: Hitzschlag", () => {
    const result = detectEmergency("Hitzschlag");
    strictEqual(result.emergency, true);
    strictEqual(result.category, "hitzschlag");
  });

  // Stachel
  await t.test("detects Stachel: Stachel im Maul", () => {
    const result = detectEmergency("Stachel im Maul");
    strictEqual(result.emergency, true);
  });

  // Obvious keywords
  await t.test("detects obvious: Notfall sofort", () => {
    const result = detectEmergency("Notfall sofort");
    strictEqual(result.emergency, true);
  });
});

test("emergency detection: negation cases (should be false)", async (t) => {
  await t.test("ignores negation: kein Notfall", () => {
    const result = detectEmergency("kein Notfall");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores negation: nicht dringend", () => {
    const result = detectEmergency("nicht dringend");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores negation: keine Blutung", () => {
    const result = detectEmergency("keine Blutung");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores negation: kein Unfall", () => {
    const result = detectEmergency("kein Unfall");
    strictEqual(result.emergency, false);
  });
});

test("emergency detection: harmless cases (should be false)", async (t) => {
  await t.test("ignores harmless: Impftermin für Bella", () => {
    const result = detectEmergency("Impftermin für Bella");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores harmless: Kastration nächste Woche", () => {
    const result = detectEmergency("Kastration nächste Woche");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores harmless: Zahnsteinentfernung", () => {
    const result = detectEmergency("Zahnsteinentfernung");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores harmless: Routineuntersuchung", () => {
    const result = detectEmergency("Routineuntersuchung");
    strictEqual(result.emergency, false);
  });

  await t.test("ignores harmless: Flohbehandlung", () => {
    const result = detectEmergency("Flohbehandlung");
    strictEqual(result.emergency, false);
  });
});

test("emergency detection: normalization", async (t) => {
  await t.test("handles Umlaute: Krampfanfälle", () => {
    const result = detectEmergency("Krampfanfälle");
    strictEqual(result.emergency, true);
  });

  await t.test("handles ß -> ss: Blödsinn (not matched), Atem (matched)", () => {
    const result = detectEmergency("Bekommt keine Luft, das ist kein Bloedsinn");
    strictEqual(result.emergency, true);
  });

  await t.test("handles case insensitivity: BLUTUNG STARK", () => {
    const result = detectEmergency("BLUTUNG STARK");
    strictEqual(result.emergency, true);
  });

  await t.test("handles mixed case: BlUtUnG", () => {
    const result = detectEmergency("BlUtUnG");
    strictEqual(result.emergency, true);
  });
});

test("emergency detection: matched field", async (t) => {
  await t.test("includes matched phrase", () => {
    const result = detectEmergency("Der Hund schnauft");
    strictEqual(typeof result.matched, "string");
    strictEqual(result.matched!.length > 0, true);
  });

  await t.test("returns obvious for obvious keywords", () => {
    const result = detectEmergency("Das ist ein Notfall");
    deepStrictEqual(result.matched, "obvious");
  });
});
