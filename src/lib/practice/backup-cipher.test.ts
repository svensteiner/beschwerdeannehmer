import assert from "node:assert/strict";
import test from "node:test";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  BACKUP_CIPHER_MAGIC,
  BACKUP_CIPHER_MIN_PASSPHRASE,
  backupCipherPassphraseOk,
  backupCipherVersion,
  isEncryptedBackup,
} from "./backup-cipher.ts";
import { decryptBackup, encryptBackup } from "./backup-cipher.server.ts";

test("Passwortprüfung erzwingt die Mindest- und Höchstlänge", () => {
  assert.equal(BACKUP_CIPHER_MIN_PASSPHRASE, 8);
  assert.equal(backupCipherPassphraseOk("1234567"), false);
  assert.equal(backupCipherPassphraseOk("12345678"), true);
  assert.equal(backupCipherPassphraseOk("x".repeat(200)), true);
  assert.equal(backupCipherPassphraseOk("x".repeat(201)), false);
  assert.equal(backupCipherPassphraseOk(12345678), false);
  assert.equal(backupCipherPassphraseOk(null), false);
  assert.equal(backupCipherPassphraseOk(""), false);
});

test("Verschlüsselung und Entschlüsselung bilden einen Rundlauf", async () => {
  const plain = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
  const enc = await encryptBackup(plain, "richtiges-passwort");
  assert.equal(isEncryptedBackup(enc), true);
  assert.equal(isEncryptedBackup(plain), false);
  const dec = await decryptBackup(enc, "richtiges-passwort");
  assert.ok(dec.ok, "Entschlüsselung liefert den Dump zurück");
  assert.ok(Buffer.from(dec.data).equals(Buffer.from(plain)));
});

test("falsches Passwort scheitert am GCM-Tag", async () => {
  const enc = await encryptBackup(new Uint8Array(40), "richtig-123");
  const dec = await decryptBackup(enc, "falsch-456");
  assert.equal(dec.ok, false);
  assert.equal(dec.reason, "wrong_password");
});

test("Entschlüsseln eines fremden Formats meldet beschädigt, nicht falsches Passwort", async () => {
  for (const input of [new Uint8Array([0x1f, 0x8b]), new Uint8Array(0), null as unknown as Uint8Array]) {
    const res = await decryptBackup(input, "egal");
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "corrupt");
  }
});

/** Baut einen alten SLVBK01-Container (N=16384) für den Rückwärts-Kompat-Test. */
function encryptV1(plaintext: Uint8Array, passphrase: string): Uint8Array {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([new TextEncoder().encode(BACKUP_CIPHER_MAGIC), salt, nonce, ciphertext, tag]);
}

test("neue Sicherungen tragen SLVBK02", async () => {
  const enc = await encryptBackup(new Uint8Array(16), "passwort-123");
  assert.equal(backupCipherVersion(enc), 2);
  assert.equal(isEncryptedBackup(enc), true);
});

test("alte SLVBK01-Sicherungen bleiben entschlüsselbar", async () => {
  const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const v1 = encryptV1(plain, "altes-passwort");
  assert.equal(backupCipherVersion(v1), 1);
  const dec = await decryptBackup(v1, "altes-passwort");
  assert.ok(dec.ok, "alte Sicherung wird mit N=16384 gelesen");
  assert.ok(Buffer.from(dec.data).equals(Buffer.from(plain)));
});

test("falsches Passwort scheitert auch bei SLVBK01", async () => {
  const v1 = encryptV1(new Uint8Array(24), "richtig-123");
  const dec = await decryptBackup(v1, "falsch-456");
  assert.equal(dec.ok, false);
  if (dec.ok) throw new Error("unreachable");
  assert.equal(dec.reason, "wrong_password");
});
