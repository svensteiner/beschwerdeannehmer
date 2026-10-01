type Bucket = { count: number; resetAt: number };

const globalRef = globalThis as typeof globalThis & {
  __silviaRateLimit__?: Map<string, Bucket>;
};

function store(): Map<string, Bucket> {
  globalRef.__silviaRateLimit__ ??= new Map();
  return globalRef.__silviaRateLimit__;
}

/**
 * Abgelaufene Buckets werden opportunistisch entfernt, damit der Schlüsselbestand
 * nicht unbegrenzt wächst (z. B. viele geratene E-Mails bei Login-Versuchen).
 *
 * Bewusst werden NUR abgelaufene Einträge gelöscht — nie noch laufende. Sonst
 * könnte ein Angreifer das Limit umgehen, indem er den Speicher mit fremden
 * Schlüsseln volllaufen lässt und so aktive Sperren verdrängt.
 */
const PRUNE_EVERY_CALLS = 256;
let callsSincePrune = 0;

/** Entfernt abgelaufene Buckets; liefert die Anzahl. `takeToken` ruft das automatisch. */
export function rateLimitPruneExpired(now = Date.now()): number {
  const buckets = store();
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Bucket-Anzahl — für Tests und Betriebs-Checks (wächst nicht unbegrenzt). */
export function rateLimitBucketCount(): number {
  return store().size;
}

export const LOGIN_ATTEMPT_LIMIT = 8;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Ergebnis einer Limitpruefung.
 *
 * `allowed` trennt die Zulaessigkeit vom Verbrauch: Ein erlaubter Versuch darf
 * nie abgewiesen werden. Frueher lieferte `takeToken` bei `limit = 1` im ersten
 * Aufruf eine 0 („Restquote“), und der Aufrufer deutete das als „Limit
 * erreicht“ — der erste erlaubte Versuch wurde also abgewiesen.
 */
export type RateLimitTake =
  | { allowed: true; remainingQuota: number }
  | { allowed: false; retryAfterMs: number };

/** Consume one unit. Erlaubt genau `limit` Aufrufe je Fenster. */
export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitTake {
  callsSincePrune += 1;
  if (callsSincePrune >= PRUNE_EVERY_CALLS) {
    callsSincePrune = 0;
    rateLimitPruneExpired(now);
  }
  const buckets = store();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remainingQuota: Math.max(0, limit - 1) };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(0, current.resetAt - now) };
  }
  current.count += 1;
  return { allowed: true, remainingQuota: Math.max(0, limit - current.count) };
}

export function remaining(key: string, limit: number, now = Date.now()): number {
  const current = store().get(key);
  if (!current || now >= current.resetAt) return limit;
  return Math.max(0, limit - current.count);
}

/**
 * Gibt einen bereits gezählten Versuch zurück.
 *
 * Wird gebraucht, wenn ein Versuch das Limit nicht belasten darf: eine
 * erfolgreiche Anmeldung, ein technischer Fehler oder eine abgewiesene
 * Anfrage, die gar nicht bis zur Passwortprüfung kam.
 */
export function refundToken(key: string, now = Date.now()): void {
  const current = store().get(key);
  if (!current || now >= current.resetAt) return;
  current.count = Math.max(0, current.count - 1);
}

export function retryAfterMs(key: string, now = Date.now()): number {
  const current = store().get(key);
  if (!current || now >= current.resetAt) return 0;
  return Math.max(0, current.resetAt - now);
}

/** How long the Kassa should wait — minutes, not a silent "kurz". */
export function waitCopy(ms: number): string {
  const wait = Math.max(0, Math.floor(ms));
  if (wait < 120_000) return "Bitte in etwa einer Minute noch einmal.";
  const minutes = Math.ceil(wait / 60_000);
  if (minutes >= 50) return "Bitte in etwa einer Stunde noch einmal.";
  return `Bitte in etwa ${minutes} Minuten noch einmal.`;
}

export function tooManyTries(waitMs: number): string {
  return `Zu viele Versuche. ${waitCopy(waitMs)}`;
}

/** Consume a token, or the German wait copy when the bucket is empty. */
export function rateLimitError(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): string | null {
  const result = takeToken(key, limit, windowMs, now);
  if (result.allowed) return null;
  return tooManyTries(result.retryAfterMs);
}

function loginKeys(ip: string, email: string) {
  return { ip: `login:${ip}`, email: `login-email:${email}` };
}

/** Peek only — a correct password must not burn the lockout quota. */
export function loginLockedError(ip: string, email: string, now = Date.now()): string | null {
  const keys = loginKeys(ip, email);
  if (
    remaining(keys.ip, LOGIN_ATTEMPT_LIMIT, now) > 0 &&
    remaining(keys.email, LOGIN_ATTEMPT_LIMIT, now) > 0
  ) {
    return null;
  }
  return tooManyTries(Math.max(retryAfterMs(keys.ip, now), retryAfterMs(keys.email, now)));
}

/**
 * Einen Fehlversuch zaehlen. Erst wenn das Limit erreicht ist, wird ein
 * weiterer Versuch abgelehnt — der achte Fehlversuch wird also noch gezaehlt.
 */
export function noteFailedLogin(ip: string, email: string, now = Date.now()): void {
  const keys = loginKeys(ip, email);
  takeToken(keys.ip, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, now);
  takeToken(keys.email, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, now);
}

/**
 * Eine Anmeldung beginnt und zählt den Versuch sofort.
 *
 * Früher wurde zuerst nur geprüft (`loginLockedError`) und erst nach den
 * Wartezeiten gezählt (`noteFailedLogin`). Zwischen Prüfung und Zählung liegen
 * Datenbank- und Krypto-Aufrufe; parallele Versuche bestanden dadurch alle die
 * Prüfung, bevor der erste Fehlversuch verbucht war.
 *
 * Ein abgewiesener Versuch belastet das Limit nicht.
 */
export function loginAttemptStart(
  ip: string,
  email: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; error: string } {
  const keys = loginKeys(ip, email);
  const ipResult = takeToken(keys.ip, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, now);
  const emailResult = takeToken(keys.email, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, now);
  if (ipResult.allowed && emailResult.allowed) return { allowed: true };
  // Nur die Schlüssel zurückgeben, die tatsächlich gezählt haben — ein
  // gesperrter Schlüssel wurde nicht erhöht.
  if (ipResult.allowed) refundToken(keys.ip, now);
  if (emailResult.allowed) refundToken(keys.email, now);
  return {
    allowed: false,
    error: tooManyTries(Math.max(
      ipResult.allowed ? 0 : ipResult.retryAfterMs,
      emailResult.allowed ? 0 : emailResult.retryAfterMs,
    )),
  };
}

/** Eine erfolgreiche Anmeldung belastet das Limit nicht. */
export function refundLoginAttempt(ip: string, email: string, now = Date.now()): void {
  const keys = loginKeys(ip, email);
  refundToken(keys.ip, now);
  refundToken(keys.email, now);
}
