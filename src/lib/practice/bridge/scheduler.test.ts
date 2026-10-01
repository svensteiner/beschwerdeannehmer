import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sql } from "@/lib/db";
import { VQUADRAT_LABEL } from "../praxissoftware.ts";
import { parseSyncMinutes, practiceSyncTimeoutMs, startBridgeScheduler, withTimeout } from "./scheduler.ts";
import type { SyncRun } from "./schema.ts";

function fakeRun(scope: "master" | "outbox"): SyncRun {
  return {
    id: "run-1",
    practiceId: "p1",
    pmsKind: "vquadrat",
    scope,
    startedAt: new Date(),
    finishedAt: new Date(),
    ok: true,
    stats: {},
    error: null,
  };
}

/**
 * Fake-Sql fuer den Scheduler.
 *
 * Punkt 17 verlangt zwei Aufrufe mehr: `try_claim_pms_sync` und
 * `release_pms_sync`. Deshalb wird hier nach Anweisungstext unterschieden.
 * `claimed: false` stellt einen anderen Server nach.
 */
function fakeBridgeSql(
  rows: Array<{ id: string; pms: string | null }>,
  options: { claimed?: boolean } = {},
): Sql {
  const sql = (async (strings: TemplateStringsArray) => {
    const text = strings.join(" ");
    if (/try_claim_pms_sync/.test(text)) return [{ ok: options.claimed !== false }];
    if (/release_pms_sync/.test(text)) return [{ ok: true }];
    return rows;
  }) as unknown as Sql;
  sql.query = (async () => rows) as unknown as Sql["query"];
  return sql;
}

function engine() {
  return {
    syncMasterData: async () => fakeRun("master"),
    syncOwnerByPhone: async () => fakeRun("master"),
    syncOwnerByName: async () => fakeRun("master"),
    flushOutbox: async () => fakeRun("outbox"),
    flushOutboxItem: async () => fakeRun("outbox"),
  };
}

test("parseSyncMinutes: unset/blank/zero/negative/non-numeric all mean off", () => {
  assert.equal(parseSyncMinutes({}), 0);
  assert.equal(parseSyncMinutes({ SILVIA_PMS_SYNC_MINUTES: "" }), 0);
  assert.equal(parseSyncMinutes({ SILVIA_PMS_SYNC_MINUTES: "0" }), 0);
  assert.equal(parseSyncMinutes({ SILVIA_PMS_SYNC_MINUTES: "-5" }), 0);
  assert.equal(parseSyncMinutes({ SILVIA_PMS_SYNC_MINUTES: "abc" }), 0);
  assert.equal(parseSyncMinutes({ SILVIA_PMS_SYNC_MINUTES: "15" }), 15);
});

test("practiceSyncTimeoutMs: Default und Grenzen", () => {
  assert.equal(practiceSyncTimeoutMs({}), 60_000);
  assert.equal(practiceSyncTimeoutMs({ SILVIA_PMS_SYNC_TIMEOUT_SECONDS: "5" }), 5_000);
  // Unsinnige Angaben fallen auf den Default.
  assert.equal(practiceSyncTimeoutMs({ SILVIA_PMS_SYNC_TIMEOUT_SECONDS: "0" }), 60_000);
  assert.equal(practiceSyncTimeoutMs({ SILVIA_PMS_SYNC_TIMEOUT_SECONDS: "-1" }), 60_000);
  assert.equal(practiceSyncTimeoutMs({ SILVIA_PMS_SYNC_TIMEOUT_SECONDS: "abc" }), 60_000);
  // Nach oben gedeckelt, damit ein Tippfehler nicht alles blockiert.
  assert.equal(practiceSyncTimeoutMs({ SILVIA_PMS_SYNC_TIMEOUT_SECONDS: "99999" }), 30 * 60_000);
});

test("withTimeout: gibt das Ergebnis durch oder meldet die Zeitgrenze", async () => {
  assert.deepEqual(await withTimeout(Promise.resolve(7), 1000), { timedOut: false, value: 7 });
  const hanging = new Promise<number>(() => {});
  assert.deepEqual(await withTimeout(hanging, 5), { timedOut: true });
  // Ohne Grenze wird nur gewartet.
  assert.deepEqual(await withTimeout(Promise.resolve("x"), 0), { timedOut: false, value: "x" });
});

test("startBridgeScheduler is a no-op (never calls setInterval) when the env var is unset", async () => {
  let intervalCalls = 0;
  const scheduler = startBridgeScheduler(
    {},
    {
      setInterval: (() => {
        intervalCalls += 1;
        return 0 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => {
        throw new Error("should not be called");
      },
    },
  );
  assert.equal(intervalCalls, 0);
  await scheduler.stop();
});

test("startBridgeScheduler ticks every N minutes, runs sync for adapters with a registered pms, skips others", async () => {
  let tickFn: (() => void) | null = null;
  let intervalMs = 0;
  const syncedPractices: string[] = [];
  const fakeSql = fakeBridgeSql([
    { id: "p1", pms: VQUADRAT_LABEL },
    { id: "p2", pms: "Unbekannte Software" },
    { id: "p3", pms: null },
  ]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "5" },
    {
      setInterval: ((fn: () => void, ms: number) => {
        tickFn = fn;
        intervalMs = ms;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      runOnStart: false,
      syncFor: (_sql, practiceId) => {
        syncedPractices.push(practiceId);
        return { engine: engine() };
      },
    },
  );
  assert.equal(intervalMs, 5 * 60_000);
  assert.ok(tickFn);
  (tickFn as () => void)();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(syncedPractices, ["p1"]);
  await scheduler.stop();
});

test("Punkt 14: der erste Lauf startet sofort, nicht erst nach einem Intervall", async () => {
  const syncedPractices: string[] = [];
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }]);

  // Ohne runOnStart:false muss der Lauf von selbst anspringen.
  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "60" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      syncFor: (_sql, practiceId) => {
        syncedPractices.push(practiceId);
        return { engine: engine() };
      },
    },
  );
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(syncedPractices, ["p1"], "sofort gearbeitet, nicht erst nach 60 Minuten");
  await scheduler.stop();
});

test("Punkt 15: stop() wartet auf den laufenden Durchgang", async () => {
  let release: (() => void) | null = null;
  let finished = false;
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      syncFor: () => ({
        engine: {
          ...engine(),
          syncMasterData: () =>
            new Promise<SyncRun>((resolve) => {
              release = () => {
                finished = true;
                resolve(fakeRun("master"));
              };
            }),
        },
      }),
    },
  );
  await new Promise((r) => setTimeout(r, 0));

  const stopped = scheduler.stop();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(finished, false, "stop() kehrt nicht zurueck, solange die Uebertragung laeuft");

  (release as unknown as () => void)?.();
  await stopped;
  assert.equal(finished, true, "nach dem Durchgang ist stop() fertig");
});

test("Punkt 15: nach stop() beginnt keine weitere Praxis", async () => {
  const started: string[] = [];
  let releaseFirst: (() => void) | null = null;
  const fakeSql = fakeBridgeSql([
    { id: "p1", pms: VQUADRAT_LABEL },
    { id: "p2", pms: VQUADRAT_LABEL },
  ]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      syncFor: (_sql, practiceId) => {
        started.push(practiceId);
        return {
          engine: {
            ...engine(),
            syncMasterData: () =>
              new Promise<SyncRun>((resolve) => {
                releaseFirst = () => resolve(fakeRun("master"));
              }),
          },
        };
      },
    },
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(started, ["p1"], "die erste Praxis laeuft");

  const stopped = scheduler.stop();
  (releaseFirst as unknown as () => void)?.();
  await stopped;
  assert.deepEqual(started, ["p1"], "die zweite Praxis wird nicht mehr begonnen");
});

test("Punkt 16: eine haengende Praxis blockiert die naechste nicht", async () => {
  const started: string[] = [];
  const logs: string[] = [];
  const fakeSql = fakeBridgeSql([
    { id: "p1", pms: VQUADRAT_LABEL },
    { id: "p2", pms: VQUADRAT_LABEL },
  ]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      log: (message) => logs.push(message),
      practiceTimeoutMs: 10,
      stopDrainMs: 5,
      syncFor: (_sql, practiceId) => {
        started.push(practiceId);
        return {
          engine: {
            ...engine(),
            // Die erste Praxis wartet dauerhaft.
            syncMasterData: () =>
              practiceId === "p1" ? new Promise<SyncRun>(() => {}) : Promise.resolve(fakeRun("master")),
          },
        };
      },
    },
  );
  await new Promise((r) => setTimeout(r, 60));

  assert.deepEqual(started, ["p1", "p2"], "die zweite Praxis lief trotzdem");
  assert.match(logs.join("\n"), /Zeitgrenze erreicht/);
  await scheduler.stop();
});

test("Punkt 2: nach einer Zeitgrenze bleibt die Reservierung bestehen", async () => {
  const releases: string[] = [];
  let tickFn: (() => void) | null = null;
  let releaseWork: (() => void) | null = null;
  // Reservierung gelingt; Freigaben werden mitgeschrieben.
  const sql = (async (strings: TemplateStringsArray) => {
    const text = strings.join(" ");
    if (/try_claim_pms_sync/.test(text)) return [{ ok: true }];
    if (/release_pms_sync/.test(text)) {
      releases.push("release");
      return [{ ok: true }];
    }
    return [{ id: "p1", pms: VQUADRAT_LABEL }];
  }) as unknown as Sql;
  sql.query = (async () => []) as unknown as Sql["query"];

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => sql,
      log: () => {},
      practiceTimeoutMs: 10,
      stopDrainMs: 5,
      runOnStart: false,
      syncFor: () => ({
        engine: {
          ...engine(),
          syncMasterData: () =>
            new Promise<SyncRun>((resolve) => {
              releaseWork = () => resolve(fakeRun("master"));
            }),
        },
      }),
    },
  );
  (tickFn as unknown as () => void)();
  // Auf die Zeitgrenze warten.
  await new Promise((r) => setTimeout(r, 50));

  // Punkt 2: die Reservierung darf NICHT freigegeben sein, solange die
  // Hintergrundarbeit laeuft — sonst koennte ein zweiter Server dieselbe
  // womoeglich noch laufende Uebertragung beginnen.
  assert.deepEqual(releases, [], "keine Freigabe waehrend der Hintergrundarbeit");

  // Erst nach dem Ende der Arbeit wird freigegeben.
  (releaseWork as unknown as () => void)?.();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(releases, ["release"], "nach dem Ende wird freigegeben");

  await scheduler.stop();
});

test("Punkt 3: stop() wartet auch auf Arbeit nach einer Zeitgrenze", async () => {
  let tickFn: (() => void) | null = null;
  let releaseWork: (() => void) | null = null;
  let workFinished = false;
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      log: () => {},
      practiceTimeoutMs: 5,
      stopDrainMs: 5_000,
      runOnStart: false,
      syncFor: () => ({
        engine: {
          ...engine(),
          syncMasterData: () =>
            new Promise<SyncRun>((resolve) => {
              releaseWork = () => {
                workFinished = true;
                resolve(fakeRun("master"));
              };
            }),
        },
      }),
    },
  );
  (tickFn as unknown as () => void)();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(workFinished, false, "die Arbeit laeuft noch");

  // stop() wird aufgerufen, waehrend die Hintergrundarbeit laeuft.
  let stopped = false;
  const stopping = scheduler.stop().then(() => {
    stopped = true;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(stopped, false, "stop() wartet auf die Hintergrundarbeit");

  (releaseWork as unknown as () => void)?.();
  await stopping;
  assert.equal(workFinished, true);
  assert.equal(stopped, true);
});

test("Punkt 3: stop() blockiert nicht ewig, wenn Arbeit haengt", async () => {
  let tickFn: (() => void) | null = null;
  const logs: string[] = [];
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      log: (message) => logs.push(message),
      practiceTimeoutMs: 5,
      stopDrainMs: 30,
      runOnStart: false,
      syncFor: () => ({
        engine: {
          ...engine(),
          // Bleibt fuer immer haengen.
          syncMasterData: () => new Promise<SyncRun>(() => {}),
        },
      }),
    },
  );
  (tickFn as unknown as () => void)();
  await new Promise((r) => setTimeout(r, 40));

  const started = Date.now();
  await scheduler.stop();
  const elapsed = Date.now() - started;

  // Begrenzt: das Herunterfahren blockiert nicht, aber es wird gemeldet.
  assert.ok(elapsed < 2_000, `stop() kehrte nach ${elapsed} ms zurueck`);
  assert.match(logs.join("\n"), /Hintergrundarbeit laeuft noch/);
});

test("Punkt 17: eine Praxis, die ein anderer Server haelt, wird uebersprungen", async () => {
  const started: string[] = [];
  const logs: string[] = [];
  // Der Reservierungsversuch schlaegt fehl: ein anderer Server arbeitet.
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }], { claimed: false });

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      log: (message) => logs.push(message),
      syncFor: (_sql, practiceId) => {
        started.push(practiceId);
        return { engine: engine() };
      },
    },
  );
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(started, [], "kein doppelter Abgleich");
  assert.match(logs.join("\n"), /anderer Server arbeitet/);
  await scheduler.stop();
});

test("Punkt 17: ohne moegliche Reservierung wird nicht gearbeitet", async () => {
  const started: string[] = [];
  const logs: string[] = [];
  // Die Reservierung wirft (z. B. fehlende Migration).
  const throwing = (async () => {
    throw new Error("relation does not exist");
  }) as unknown as Sql;
  throwing.query = async () => {
    throw new Error("relation does not exist");
  };

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as never,
      clearInterval: () => {},
      getSql: async () => throwing,
      log: (message) => logs.push(message),
      syncFor: (_sql, practiceId) => {
        started.push(practiceId);
        return { engine: engine() };
      },
    },
  );
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Ohne Reservierung lieber ueberspringen als unkoordiniert doppelt senden.
  // Die Praxisliste konnte nicht gelesen werden, also passiert nichts.
  assert.deepEqual(started, []);
  await scheduler.stop();
});

test("startBridgeScheduler skips a tick that overlaps a still-running previous tick", async () => {
  let tickFn: (() => void) | null = null;
  let runs = 0;
  let resolveFirst: (() => void) | null = null;
  const fakeSql = fakeBridgeSql([{ id: "p1", pms: VQUADRAT_LABEL }]);

  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      runOnStart: false,
      syncFor: () => {
        runs += 1;
        return {
          engine: {
            ...engine(),
            syncMasterData: () =>
              new Promise<SyncRun>((resolve) => {
                resolveFirst = () => resolve(fakeRun("master"));
              }),
          },
        };
      },
    },
  );
  (tickFn as unknown as () => void)();
  await new Promise((r) => setTimeout(r, 0));
  (tickFn as unknown as () => void)(); // overlapping tick — should be skipped
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(runs, 1);
  (resolveFirst as unknown as () => void)?.();
  await new Promise((r) => setTimeout(r, 0));
  await scheduler.stop();
});

test("startBridgeScheduler redacts thrown error details from logs", async () => {
  let tickFn: (() => void) | null = null;
  const logs: string[] = [];
  const fakeSql = fakeBridgeSql([{ id: "practice-secret", pms: VQUADRAT_LABEL }]);
  const scheduler = startBridgeScheduler(
    { SILVIA_PMS_SYNC_MINUTES: "1" },
    {
      setInterval: ((fn: () => void) => {
        tickFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: () => {},
      getSql: async () => fakeSql,
      log: (message) => logs.push(message),
      runOnStart: false,
      syncFor: () => ({
        engine: {
          ...engine(),
          syncMasterData: async () => {
            throw new Error("Patientin Erika Musterfrau +43 660 123456");
          },
        },
      }),
    },
  );
  (tickFn as (() => void) | null)?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const combined = logs.join("\n");
  assert.match(combined, /Lauf fehlgeschlagen: Interner Bridge-Fehler/);
  assert.doesNotMatch(combined, /Erika|Musterfrau|\+43|123456/);
  await scheduler.stop();
});
