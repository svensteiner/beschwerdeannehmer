import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
  loginAttemptStart,
  loginLockedError,
  noteFailedLogin,
  rateLimitBucketCount,
  rateLimitError,
  rateLimitPruneExpired,
  refundLoginAttempt,
  remaining,
  retryAfterMs,
  takeToken,
  tooManyTries,
  waitCopy,
} from "./rate-limit.ts";

test("allows up to the limit then refuses", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.deepEqual(takeToken(key, 2, 60_000, 1_000), { allowed: true, remainingQuota: 1 });
  assert.deepEqual(takeToken(key, 2, 60_000, 1_100), { allowed: true, remainingQuota: 0 });
  // Das Limit ist erreicht: weitere Aufrufe werden abgewiesen.
  const refused = takeToken(key, 2, 60_000, 1_200);
  assert.equal(refused.allowed, false);
  assert.equal(remaining(key, 2, 1_200), 0);
});

test("der erste erlaubte Versuch wird nie abgewiesen (limit 1)", () => {
  // Frueher lieferte takeToken bei limit 1 im ersten Aufruf eine 0, und der
  // Aufrufer deutete das als "Limit erreicht". Der erste Versuch wurde also
  // abgewiesen, obwohl er erlaubt war.
  const key = `erst-${Date.now()}-${Math.random()}`;
  assert.equal(takeToken(key, 1, 60_000, 1_000).allowed, true);
  assert.equal(takeToken(key, 1, 60_000, 1_100).allowed, false);
  // Auch im Fehlerpfad: der erste Aufruf meldet keinen Fehler.
  const errorKey = `erst-fehler-${Date.now()}-${Math.random()}`;
  assert.equal(rateLimitError(errorKey, 1, 60_000, 1_000), null);
  assert.notEqual(rateLimitError(errorKey, 1, 60_000, 1_100), null);
});

test("resets after the window", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(takeToken(key, 1, 100, 1_000).allowed, true);
  assert.equal(takeToken(key, 1, 100, 1_050).allowed, false);
  // Nach Ablauf des Fensters ist wieder ein Versuch erlaubt.
  assert.equal(takeToken(key, 1, 100, 1_101).allowed, true);
});

test("abgelaufene Buckets werden aufgeräumt, laufende bleiben", () => {
  const marker = `prune-${Date.now()}-${Math.random()}`;
  takeToken(marker, 1, 100, 1_000); // resetAt 1100, abgelaufen
  takeToken(`${marker}-live`, 1, 60_000, 1_000); // resetAt 61_000, noch laufend
  const before = rateLimitBucketCount();
  const removed = rateLimitPruneExpired(10_000);
  // Mindestens der abgelaufene Marker ist weg; der laufende Bucket bleibt.
  assert.ok(removed >= 1, `mindestens ein Bucket entfernt (${removed})`);
  assert.equal(remaining(marker, 1, 10_000), 1);
  assert.equal(remaining(`${marker}-live`, 1, 10_000), 0);
  assert.ok(rateLimitBucketCount() < before, "Bestand ist geschrumpft");
});

test("wait copy names the minute, the minutes, or the hour", () => {
  assert.equal(waitCopy(0), "Bitte in etwa einer Minute noch einmal.");
  assert.equal(waitCopy(119_999), "Bitte in etwa einer Minute noch einmal.");
  assert.equal(waitCopy(120_000), "Bitte in etwa 2 Minuten noch einmal.");
  assert.equal(waitCopy(14 * 60_000 + 1), "Bitte in etwa 15 Minuten noch einmal.");
  assert.equal(waitCopy(50 * 60_000), "Bitte in etwa einer Stunde noch einmal.");
  assert.equal(tooManyTries(15 * 60_000), "Zu viele Versuche. Bitte in etwa 15 Minuten noch einmal.");
});

test("rateLimitError returns wait copy only when the bucket is empty", () => {
  const key = `wait-${Date.now()}-${Math.random()}`;
  // Bei limit 2 sind zwei Aufrufe erlaubt, der dritte meldet den Fehler.
  assert.equal(rateLimitError(key, 2, 15 * 60_000, 1_000), null);
  assert.equal(rateLimitError(key, 2, 15 * 60_000, 1_000), null);
  const err = rateLimitError(key, 2, 15 * 60_000, 1_000);
  assert.equal(err, "Zu viele Versuche. Bitte in etwa 15 Minuten noch einmal.");
  assert.equal(retryAfterMs(key, 1_000), 15 * 60_000);
});

test("login lockout counts failed tries, not a successful peek", () => {
  const ip = `10.0.0.${Math.floor(Math.random() * 200)}`;
  const email = `kassa.lock.${Date.now()}@example.com`;
  const t0 = 5_000;
  for (let i = 0; i < LOGIN_ATTEMPT_LIMIT - 1; i += 1) {
    assert.equal(loginLockedError(ip, email, t0), null);
    noteFailedLogin(ip, email, t0);
  }
  assert.equal(loginLockedError(ip, email, t0), null);
  noteFailedLogin(ip, email, t0);
  const locked = loginLockedError(ip, email, t0);
  assert.equal(locked, "Zu viele Versuche. Bitte in etwa 15 Minuten noch einmal.");
  assert.equal(loginLockedError(ip, email, t0 + LOGIN_ATTEMPT_WINDOW_MS), null);
});

test("loginAttemptStart zaehlt den Versuch sofort", () => {
  const ip = `10.1.0.${Math.floor(Math.random() * 200)}`;
  const email = `start.${Date.now()}@example.com`;
  const t0 = 7_000;
  // Alle erlaubten Versuche werden sofort gezaehlt — nicht erst nach den
  // Wartezeiten. Sonst bestehen parallele Anfragen alle die Pruefung.
  for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i += 1) {
    assert.equal(loginAttemptStart(ip, email, t0).allowed, true, `Versuch ${i + 1} erlaubt`);
  }
  const blocked = loginAttemptStart(ip, email, t0);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.allowed === false ? blocked.error : "", /Zu viele Versuche/);
});

test("ein abgewiesener Anmeldeversuch belastet das Limit nicht", () => {
  const ip = `10.2.0.${Math.floor(Math.random() * 200)}`;
  const email = `refund.block.${Date.now()}@example.com`;
  const t0 = 9_000;
  for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i += 1) loginAttemptStart(ip, email, t0);
  // Mehrfach abgewiesen: der Zaehler darf dadurch nicht weiter steigen.
  for (let i = 0; i < 5; i += 1) assert.equal(loginAttemptStart(ip, email, t0).allowed, false);
  refundLoginAttempt(ip, email, t0);
  assert.equal(loginAttemptStart(ip, email, t0).allowed, true, "nach der Rueckgabe ist wieder Platz");
});

test("eine erfolgreiche Anmeldung gibt den Versuch zurueck", () => {
  const ip = `10.3.0.${Math.floor(Math.random() * 200)}`;
  const email = `refund.ok.${Date.now()}@example.com`;
  const t0 = 11_000;
  // Nach einer erfolgreichen Anmeldung bleibt das Limit unbelastet.
  for (let i = 0; i < 20; i += 1) {
    assert.equal(loginAttemptStart(ip, email, t0).allowed, true, `Durchlauf ${i + 1}`);
    refundLoginAttempt(ip, email, t0);
  }
  assert.equal(remaining(`login:${ip}`, LOGIN_ATTEMPT_LIMIT, t0), LOGIN_ATTEMPT_LIMIT);
});
