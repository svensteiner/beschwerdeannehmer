import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  hashPasswordAsync,
  hashToken,
  TIMING_EQUALIZER_HASH,
  verifyPassword,
  verifyPasswordAsync,
} from "./crypto.ts";
import { isStrongEnoughPassword, MAX_PASSWORD_LENGTH, normalizeEmail, passwordChangeCheck } from "./crypto-shared.ts";test("password hash verifies the original and rejects others", () => {
  const stored = hashPassword("Ordination1!");
  assert.equal(verifyPassword("Ordination1!", stored), true);
  assert.equal(verifyPassword("wrong-pass", stored), false);
  assert.equal(verifyPassword("Ordination1!", "not-a-hash"), false);
});

test("die asynchrone Variante erzeugt und prueft denselben Hash", async () => {
  // Die Anfragepfade nutzen die asynchrone Variante, damit scrypt den Server
  // nicht blockiert. Beide Formate muessen zueinander passen.
  const stored = await hashPasswordAsync("Ordination1!");
  assert.equal(await verifyPasswordAsync("Ordination1!", stored), true);
  assert.equal(await verifyPasswordAsync("wrong-pass", stored), false);
  // Auch gegen einen synchron erzeugten Hash.
  assert.equal(await verifyPasswordAsync("Ordination1!", hashPassword("Ordination1!")), true);
  assert.equal(await verifyPasswordAsync("Ordination1!", "not-a-hash"), false);
});

test("TIMING_EQUALIZER_HASH passt zu keinem Passwort", async () => {
  // Bei unbekannter E-Mail wird dagegen gerechnet, damit die Antwortzeit nicht
  // verraet, ob eine Adresse registriert ist. Er passt zu nichts.
  assert.equal(await verifyPasswordAsync("Ordination1!", TIMING_EQUALIZER_HASH), false);
  assert.equal(await verifyPasswordAsync("", TIMING_EQUALIZER_HASH), false);
  // Er ist syntaktisch gueltig, sonst wuerde gar nicht gerechnet.
  assert.equal(TIMING_EQUALIZER_HASH.split("$").length, 6);
  assert.equal(TIMING_EQUALIZER_HASH.startsWith("scrypt$"), true);
});

test("ein Passwort ueber der Registriergrenze ist nicht stark genug", () => {
  const tooLong = "x".repeat(MAX_PASSWORD_LENGTH + 1);
  assert.equal(isStrongEnoughPassword(tooLong), false);
  assert.equal(isStrongEnoughPassword("x".repeat(MAX_PASSWORD_LENGTH)), true);
});

test("email normalize and password floor", () => {
  assert.equal(normalizeEmail("  Dr.Huber@Ordination.AT "), "dr.huber@ordination.at");
  assert.equal(isStrongEnoughPassword("short"), false);
  assert.equal(isStrongEnoughPassword("langgenug"), true);
});

test("password change needs the old one and a different new one", () => {
  assert.equal(passwordChangeCheck("", "SilviaDesk2!", "SilviaDesk2!").ok, false);
  assert.equal(passwordChangeCheck("SilviaDesk1!", "short", "short").ok, false);
  assert.equal(passwordChangeCheck("SilviaDesk1!", "SilviaDesk2!", "SilviaDesk3!").ok, false);
  assert.equal(passwordChangeCheck("SilviaDesk1!", "SilviaDesk1!", "SilviaDesk1!").ok, false);
  assert.equal(passwordChangeCheck("SilviaDesk1!", "SilviaDesk2!", "SilviaDesk2!").ok, true);
});

test("token hash is stable and not reversible", () => {
  const a = hashToken("abc");
  assert.equal(a, hashToken("abc"));
  assert.notEqual(a, "abc");
  assert.equal(a.length, 64);
});
