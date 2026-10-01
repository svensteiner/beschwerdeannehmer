import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sql } from "@/lib/db";
import { createRetentionRunner, RETENTION_INTERVAL_MS } from "./retention.ts";

/**
 * Punkt 18: Der taegliche Ausloeser startete unabhaengig davon, ob der vorige
 * Lauf noch arbeitete. Zwei Durchgaenge griffen in dieselben Portionen und
 * verlaengerten Sperren und Laufzeit gegenseitig.
 *
 * Geprueft ohne echte Timer und ohne Datenbank.
 */

/** Ein Sql, dessen Abfrage haengt, bis der Test sie freigibt. */
function hangingSql() {
  let release: (() => void) | null = null;
  let calls = 0;
  const sql = (async () => {
    calls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return [];
  }) as unknown as Sql;
  return {
    sql,
    calls: () => calls,
    release: () => {
      const fn = release;
      release = null;
      fn?.();
    },
    hasRelease: () => release !== null,
  };
}

test("Punkt 18: ein ueberlappender Lauf wird uebersprungen", async () => {
  let tickFn: (() => void) | null = null;
  let intervalMs = 0;
  const hanging = hangingSql();

  const runner = createRetentionRunner(async () => hanging.sql, {
    setInterval: ((fn: () => void, ms: number) => {
      tickFn = fn;
      intervalMs = ms;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as never,
    clearInterval: () => {},
  });

  assert.equal(intervalMs, RETENTION_INTERVAL_MS);
  // Der Sofortlauf hat genau eine Abfrage begonnen.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hanging.calls(), 1);

  // Drei weitere Ticks duerfen nichts beginnen, weil der erste noch laeuft.
  for (let i = 0; i < 3; i += 1) {
    (tickFn as unknown as () => void)();
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.equal(hanging.calls(), 1, "kein zweiter Durchgang waehrend des ersten");

  hanging.release();
  await runner.stop();
});

test("Punkt 18: stop() wartet den laufenden Loeschlauf ab", async () => {
  const hanging = hangingSql();
  let finished = false;

  const runner = createRetentionRunner(async () => hanging.sql, {
    setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
    clearInterval: () => {},
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hanging.hasRelease(), true, "der Lauf haengt noch");

  const stopped = runner.stop().then(() => {
    finished = true;
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(finished, false, "stop() kehrt nicht zurueck, solange der Lauf arbeitet");

  hanging.release();
  await stopped;
  assert.equal(finished, true, "nach dem Lauf ist stop() fertig");
});

test("Punkt 18: nach stop() beginnt kein weiterer Lauf", async () => {
  let tickFn: (() => void) | null = null;
  let calls = 0;
  const sql = (async () => {
    calls += 1;
    return [];
  }) as unknown as Sql;

  const runner = createRetentionRunner(async () => sql, {
    setInterval: ((fn: () => void) => {
      tickFn = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as never,
    clearInterval: () => {},
  });
  await new Promise((r) => setTimeout(r, 0));
  const afterStart = calls;

  await runner.stop();
  (tickFn as unknown as () => void)();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, afterStart, "kein Lauf nach stop()");
});

test("Punkt 18: ein Fehler im Lauf blockiert spaetere nicht", async () => {
  let tickFn: (() => void) | null = null;
  let calls = 0;
  const sql = (async () => {
    calls += 1;
    throw new Error("Datenbank weg");
  }) as unknown as Sql;

  const runner = createRetentionRunner(async () => sql, {
    setInterval: ((fn: () => void) => {
      tickFn = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as never,
    clearInterval: () => {},
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 1);

  // Der naechste Tick darf wieder arbeiten.
  (tickFn as unknown as () => void)();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 2, "ein Fehler sperrt den naechsten Lauf nicht");
  await runner.stop();
});

test("ohne Fehler laeuft der Sofortstart", async () => {
  let calls = 0;
  const sql = (async () => {
    calls += 1;
    return [];
  }) as unknown as Sql;
  const runner = createRetentionRunner(async () => sql, {
    setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
    clearInterval: () => {},
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 1, "sofort einmal gearbeitet");
  await runner.stop();
});
