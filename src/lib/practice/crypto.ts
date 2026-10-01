import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// OWASP empfiehlt 2^17 für scrypt. Der Parameter steckt im Hash-Format
// (`scrypt$N$r$p$…`), sodass `verifyPassword` ältere Hashes weiterhin prüft.
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
// Node erlaubt scrypt standardmäßig nur 32 MiB; 2^17·8·128 B = 128 MiB. Deshalb
// die Grenze explizit anheben, sonst wirft scrypt „memory limit exceeded“.
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Passwort-Hash, synchron.
 *
 * Fuer Skripte und Tests. In einer Anfrage blockiert scrypt den Server, weil es
 * ~50–100 ms CPU beansprucht und kein I/O dazwischen liegt. Deshalb gibt es
 * `hashPasswordAsync` — die Anfragepfade nutzen ausschliesslich die asynchrone
 * Variante.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString("hex")}`;
}

/** Passwort-Hash ohne Serverblockade (siehe `hashPassword`). */
export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = parts[5];
  if (!n || !r || !p || !salt || !expected) return false;
  try {
    const key = scryptSync(password, salt, expected.length / 2, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
    const a = Buffer.from(expected, "hex");
    return a.length === key.length && timingSafeEqual(a, key);
  } catch {
    return false;
  }
}

/** Passwortprüfung ohne Serverblockade (siehe `hashPassword`). */
export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = parts[5];
  if (!n || !r || !p || !salt || !expected) return false;
  try {
    const key = await scryptAsync(password, salt, expected.length / 2, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
    const a = Buffer.from(expected, "hex");
    return a.length === key.length && timingSafeEqual(a, key);
  } catch {
    return false;
  }
}

/**
 * Ein syntaktisch gültiger Hash mit Zufallsschlüssel.
 *
 * Zweck: Bei unbekannter E-Mail wird trotzdem gerechnet. Sonst antwortet der
 * Server in diesem Fall spürbar schneller, und die Antwortzeit verrät, ob eine
 * Adresse registriert ist. Der Schlüssel ist zufällig — er passt zu keinem
 * Passwort, die Rechenzeit ist aber dieselbe.
 */
export const TIMING_EQUALIZER_HASH =
  `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${"0".repeat(32)}$${randomBytes(KEY_LEN).toString("hex")}`;

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

