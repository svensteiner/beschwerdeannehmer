import assert from "node:assert/strict";
import test from "node:test";
import {
  LiveBudget,
  canStartSession,
  monthKeyOf,
  recordUsage,
  remainingSeconds,
  rolloverIfNewMonth,
} from "./budget";

// Helferfunktion: Budget erstellen
function budget(
  tenantId: string,
  monthKey: string,
  usedSeconds: number,
  limitSeconds: number
): LiveBudget {
  return { tenantId, monthKey, usedSeconds, limitSeconds };
}

test("monthKeyOf: September 2026", () => {
  const d = new Date("2026-09-15T12:00:00Z");
  assert.strictEqual(monthKeyOf(d), "2026-09");
});

test("monthKeyOf: Januar (mit Padding)", () => {
  const d = new Date("2026-01-05T00:00:00Z");
  assert.strictEqual(monthKeyOf(d), "2026-01");
});

test("monthKeyOf: Dezember", () => {
  const d = new Date("2025-12-31T23:59:59Z");
  assert.strictEqual(monthKeyOf(d), "2025-12");
});

test("remainingSeconds: voll", () => {
  const b = budget("tenant1", "2026-09", 0, 3600);
  assert.strictEqual(remainingSeconds(b), 3600);
});

test("remainingSeconds: teilweise verbraucht", () => {
  const b = budget("tenant1", "2026-09", 1000, 3600);
  assert.strictEqual(remainingSeconds(b), 2600);
});

test("remainingSeconds: ausgeschöpft", () => {
  const b = budget("tenant1", "2026-09", 3600, 3600);
  assert.strictEqual(remainingSeconds(b), 0);
});

test("remainingSeconds: clamp zu 0", () => {
  const b = budget("tenant1", "2026-09", 4000, 3600);
  assert.strictEqual(remainingSeconds(b), 0);
});

test("canStartSession: ok mit ausreichend", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const result = canStartSession(b, 30);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reason, undefined);
});

test("canStartSession: budget_exhausted", () => {
  const b = budget("tenant1", "2026-09", 3600, 3600);
  const result = canStartSession(b, 30);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "budget_exhausted");
});

test("canStartSession: default 30s minimum", () => {
  const b = budget("tenant1", "2026-09", 3570, 3600);
  const result = canStartSession(b);
  assert.strictEqual(result.ok, true); // 30s verfügbar
});

test("canStartSession: unter default minimum", () => {
  const b = budget("tenant1", "2026-09", 3571, 3600);
  const result = canStartSession(b);
  assert.strictEqual(result.ok, false); // nur 29s
});

test("recordUsage: addiert normale Zeit", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, 200);
  assert.strictEqual(updated.usedSeconds, 300);
  assert.strictEqual(updated.limitSeconds, 3600);
  assert.strictEqual(updated.tenantId, "tenant1");
  assert.strictEqual(updated.monthKey, "2026-09");
});

test("recordUsage: immutable", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, 200);
  assert.strictEqual(b.usedSeconds, 100); // Original unverändert
  assert.notStrictEqual(b, updated);
});

test("recordUsage: clamp bei Überschuss", () => {
  const b = budget("tenant1", "2026-09", 3500, 3600);
  const updated = recordUsage(b, 200); // würde 3700 sein
  assert.strictEqual(updated.usedSeconds, 3600); // Geclampet
});

test("recordUsage: ignoriert NaN", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, NaN);
  assert.strictEqual(updated.usedSeconds, 100); // Unverändert
});

test("recordUsage: ignoriert negative Werte", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, -50);
  assert.strictEqual(updated.usedSeconds, 100); // Unverändert
});

test("recordUsage: ignoriert Infinity", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, Infinity);
  assert.strictEqual(updated.usedSeconds, 100); // Unverändert
});

test("recordUsage: 0 ist erlaubt", () => {
  const b = budget("tenant1", "2026-09", 100, 3600);
  const updated = recordUsage(b, 0);
  assert.strictEqual(updated.usedSeconds, 100); // Unverändert
});

test("rolloverIfNewMonth: kein Rollover gleicher Monat", () => {
  const b = budget("tenant1", "2026-09", 500, 3600);
  const now = new Date("2026-09-20T12:00:00Z");
  const updated = rolloverIfNewMonth(b, now);
  assert.strictEqual(updated.monthKey, "2026-09");
  assert.strictEqual(updated.usedSeconds, 500); // Unverändert
  assert.strictEqual(updated, b); // Same object zurück
});

test("rolloverIfNewMonth: reset bei neuer Monat", () => {
  const b = budget("tenant1", "2026-09", 500, 3600);
  const now = new Date("2026-10-01T00:00:00Z");
  const updated = rolloverIfNewMonth(b, now);
  assert.strictEqual(updated.monthKey, "2026-10");
  assert.strictEqual(updated.usedSeconds, 0); // Reset
});

test("rolloverIfNewMonth: Oktober zu November", () => {
  const b = budget("tenant1", "2026-10", 1200, 3600);
  const now = new Date("2026-11-05T10:30:00Z");
  const updated = rolloverIfNewMonth(b, now);
  assert.strictEqual(updated.monthKey, "2026-11");
  assert.strictEqual(updated.usedSeconds, 0);
  assert.strictEqual(updated.limitSeconds, 3600); // Limit unverändert
});

test("rolloverIfNewMonth: Dezember zu Januar (Jahreswechsel)", () => {
  const b = budget("tenant1", "2025-12", 2000, 3600);
  const now = new Date("2026-01-01T00:00:00Z");
  const updated = rolloverIfNewMonth(b, now);
  assert.strictEqual(updated.monthKey, "2026-01");
  assert.strictEqual(updated.usedSeconds, 0);
});

test("Integrations-Workflow: Session, Nutzung, Rollover", () => {
  let b = budget("tenant1", "2026-09", 0, 3600);

  // Session 1: 300s
  assert.strictEqual(canStartSession(b, 30).ok, true);
  b = recordUsage(b, 300);
  assert.strictEqual(b.usedSeconds, 300);

  // Session 2: 200s
  assert.strictEqual(canStartSession(b, 30).ok, true);
  b = recordUsage(b, 200);
  assert.strictEqual(b.usedSeconds, 500);

  // Monatswechsel
  const october = new Date("2026-10-01T00:00:00Z");
  b = rolloverIfNewMonth(b, october);
  assert.strictEqual(b.monthKey, "2026-10");
  assert.strictEqual(b.usedSeconds, 0);
  assert.strictEqual(remainingSeconds(b), 3600);
});
