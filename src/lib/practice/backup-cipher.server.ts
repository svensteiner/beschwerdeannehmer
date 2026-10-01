import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import {
  BACKUP_CIPHER_HEAD_BYTES,
  BACKUP_CIPHER_MAGIC_V2,
  backupCipherVersion,
} from "./backup-cipher";

/**
 * AES-256-GCM mit scrypt-abgeleitetem Schlüssel für die Tafel-Sicherung
 * (Runde 10 Punkt 18).
 *
 * Nur am Server — `node:crypto` darf nicht ins Browser-Bundle. Die scrypt-
 * Parameter entsprechen `crypto.ts` (r=8, p=1, Schlüssel 32 Byte = AES-256).
 *
 * N hängt an der MAGIC-Version (siehe `backup-cipher.ts`): neue Sicherungen
 * schreiben „SLVBK02" mit N=131072, alte „SLVBK01" mit N=16384 bleiben lesbar.
 */

const SCRYPT_N_V1 = 16384;
const SCRYPT_N_V2 = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
// N=131072 · r=8 · 128 B = 128 MiB > Nodes Standardlimit (32 MiB).
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const scryptAsync = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const MAGIC_BYTES_V2 = new TextEncoder().encode(BACKUP_CIPHER_MAGIC_V2);

/** Verschlüsselt den rohen gzip-Dump. Ergebnis beginnt mit der MAGIC-Kennung (V2). */
export async function encryptBackup(plaintext: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = await scryptAsync(passphrase, salt, KEY_BYTES, {
    N: SCRYPT_N_V2,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC_BYTES_V2, salt, nonce, ciphertext, tag]);
}

export type DecryptBackupResult =
  | { ok: true; data: Uint8Array }
  | { ok: false; reason: "wrong_password" | "corrupt" };

/**
 * Entschlüsselt eine verschlüsserte Sicherung.
 *
 * `wrong_password` = der GCM-Authentifizierungstag stimmt nicht (falsches
 * Passwort). `corrupt` = fremdes Format, zu kurz oder kein gueltiger Container.
 * Die Unterscheidung verhindert, dass eine kaputte Datei als „falsches
 * Passwort“ ausgegeben wird.
 */
export async function decryptBackup(
  encrypted: Uint8Array,
  passphrase: string,
): Promise<DecryptBackupResult> {
  const version = backupCipherVersion(encrypted);
  if (version === null) return { ok: false, reason: "corrupt" };
  const buf = Buffer.from(encrypted);
  const saltStart = BACKUP_CIPHER_HEAD_BYTES;
  const nonceStart = saltStart + SALT_BYTES;
  const bodyStart = nonceStart + NONCE_BYTES;
  if (buf.length < bodyStart + TAG_BYTES) return { ok: false, reason: "corrupt" };
  const salt = buf.subarray(saltStart, nonceStart);
  const nonce = buf.subarray(nonceStart, bodyStart);
  const ciphertext = buf.subarray(bodyStart, buf.length - TAG_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const n = version === 2 ? SCRYPT_N_V2 : SCRYPT_N_V1;
  const key = await scryptAsync(passphrase, salt, KEY_BYTES, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return { ok: true, data: Buffer.concat([decipher.update(ciphertext), decipher.final()]) };
  } catch {
    // Falsches Passwort: der Authentifizierungstag stimmt nicht.
    return { ok: false, reason: "wrong_password" };
  }
}
