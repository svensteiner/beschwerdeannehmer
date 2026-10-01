/**
 * Kennung und Passwortprüfung der verschlüsselten Tafel-Sicherung
 * (Runde 10 Punkt 18).
 *
 * Dieses Modul ist bewusst frei von `node:crypto` — es läuft im Browser und am
 * Server. Die eigentliche Ver-/Entschlüsselung (AES-256-GCM + scrypt) steht im
 * Server-Modul `backup-cipher.server.ts`, weil `node:crypto` nur am Server
 * verfügbar ist.
 *
 * Dateiformat der verschlüsselten Sicherung:
 *   MAGIC("SLVBK01"|"SLVBK02") | salt(16) | nonce(12) | AES-256-GCM-Ciphertext | Tag(16)
 *
 * Zwei MAGIC-Versionen, weil der scrypt-Parameter N im Container nicht gespeichert
 * wird. „SLVBK01" = N=16384 (alte Sicherungen), „SLVBK02" = N=131072 (neu, stärker).
 * `decryptBackup` liest die Version und wählt den passenden N — alte Sicherungen
 * bleiben entschlüsselbar, neue sind deutlich härter gegen Offline-Brute-Force.
 */

export const BACKUP_CIPHER_MAGIC = "SLVBK01";
export const BACKUP_CIPHER_MAGIC_V2 = "SLVBK02";
/** MAGIC als Bytes, damit `isEncryptedBackup` ohne `TextEncoder` auskommt. */
const MAGIC_BYTES = [0x53, 0x4c, 0x56, 0x42, 0x4b, 0x30, 0x31];
const MAGIC_BYTES_V2 = [0x53, 0x4c, 0x56, 0x42, 0x4b, 0x30, 0x32];
export const BACKUP_CIPHER_HEAD_BYTES = MAGIC_BYTES.length;
export const BACKUP_CIPHER_MIN_PASSPHRASE = 8;
export const BACKUP_CIPHER_MAX_PASSPHRASE = 200;

export function backupCipherPassphraseOk(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const n = input.length;
  return n >= BACKUP_CIPHER_MIN_PASSPHRASE && n <= BACKUP_CIPHER_MAX_PASSPHRASE;
}

function hasPrefix(bytes: Uint8Array, magic: number[]): boolean {
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/** Beginnt der Puffer mit einer Kennung, ist es eine verschlüsselte Sicherung. */
export function isEncryptedBackup(bytes: Uint8Array | null | undefined): boolean {
  if (!bytes || bytes.length < BACKUP_CIPHER_HEAD_BYTES) return false;
  return hasPrefix(bytes, MAGIC_BYTES) || hasPrefix(bytes, MAGIC_BYTES_V2);
}

/** KDF-Version aus der Kennung: 1 = „SLVBK01", 2 = „SLVBK02", null = kein Container. */
export function backupCipherVersion(bytes: Uint8Array | null | undefined): 1 | 2 | null {
  if (!bytes || bytes.length < BACKUP_CIPHER_HEAD_BYTES) return null;
  if (hasPrefix(bytes, MAGIC_BYTES_V2)) return 2;
  if (hasPrefix(bytes, MAGIC_BYTES)) return 1;
  return null;
}
