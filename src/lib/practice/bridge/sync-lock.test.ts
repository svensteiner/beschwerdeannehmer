import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Punkt 17: Parallel laufende Server koordinieren.
 *
 * Die Sperre im Scheduler gilt nur INNERHALB eines Prozesses. Zwei Server auf
 * derselben Datenbank starteten denselben Stammdatenabgleich gleichzeitig.
 * Migration 0031 legt eine Reservierung in der gemeinsamen Datenbank an.
 *
 * Grenze: PGlite hat eine Verbindung, echte Gleichzeitigkeit laesst sich hier
 * nicht fahren. Belegt ist der VERTRAG: wer zuerst reserviert, haelt; ein
 * zweiter mit anderer Kennung bekommt nichts; nach Ablauf oder Freigabe geht es
 * wieder.
 */

const NEEDED_MIGRATIONS = ["0001_silvia.sql", "0031_pms_sync_lock.sql"];

let dbPromise: Promise<PGlite> | null = null;

function db(): Promise<PGlite> {
  dbPromise ??= (async () => {
    const pg = new PGlite();
    await pg.waitReady;
    for (const name of NEEDED_MIGRATIONS) {
      await pg.exec(await readFile(join(process.cwd(), "migrations", name), "utf8"));
    }
    await pg.query(
      "insert into practices (id, name, owner_name, email) values ('p1', 'Ordination', 'Dr. Test', 'p1@example.test')",
    );
    return pg;
  })();
  return dbPromise;
}

async function claim(
  pg: PGlite,
  pms: string,
  owner: string,
  now: Date,
  leaseUntil: Date,
): Promise<boolean> {
  const rows = await pg.query<{ ok: boolean }>(
    "select try_claim_pms_sync($1,$2,$3,$4,$5) as ok",
    ["p1", pms, owner, now, leaseUntil],
  );
  return rows.rows[0]?.ok === true;
}

async function release(pg: PGlite, pms: string, owner: string): Promise<boolean> {
  const rows = await pg.query<{ ok: boolean }>("select release_pms_sync($1,$2,$3) as ok", [
    "p1",
    pms,
    owner,
  ]);
  return rows.rows[0]?.ok === true;
}

test("Punkt 17: nur ein Server haelt eine Praxis", async () => {
  const pg = await db();
  const t0 = new Date("2026-09-17T10:00:00Z");
  const lease = new Date(t0.getTime() + 5 * 60_000);

  // Server A reserviert.
  assert.equal(await claim(pg, "vquadrat", "server-a", t0, lease), true);
  // Server B kommt nicht durch, solange die Frist laeuft.
  assert.equal(await claim(pg, "vquadrat", "server-b", t0, lease), false);
  // Server A selbst darf weiterarbeiten (dieselbe Kennung).
  assert.equal(await claim(pg, "vquadrat", "server-a", t0, lease), true);

  // Ein anderes Praxisprogramm ist eine eigene Reservierung.
  assert.equal(await claim(pg, "anderes", "server-b", t0, lease), true);
});

test("Punkt 17: nach der Freigabe darf der naechste Server", async () => {
  const pg = await db();
  const t0 = new Date("2026-09-17T11:00:00Z");
  const lease = new Date(t0.getTime() + 5 * 60_000);

  assert.equal(await claim(pg, "zweites", "server-a", t0, lease), true);
  assert.equal(await claim(pg, "zweites", "server-b", t0, lease), false);

  // Nur der Halter gibt frei.
  assert.equal(await release(pg, "zweites", "server-c"), false);
  assert.equal(await release(pg, "zweites", "server-a"), true);
  assert.equal(await claim(pg, "zweites", "server-b", t0, lease), true);
});

test("Punkt 17: eine abgelaufene Reservierung wird uebernommen", async () => {
  const pg = await db();
  const t0 = new Date("2026-09-17T12:00:00Z");
  const lease = new Date(t0.getTime() + 60_000);

  assert.equal(await claim(pg, "drittes", "server-a", t0, lease), true);

  // Server A ist abgestuerzt und hat nie freigegeben. Nach Ablauf darf B.
  const afterExpiry = new Date(t0.getTime() + 2 * 60_000);
  assert.equal(await claim(pg, "drittes", "server-b", afterExpiry, new Date(afterExpiry.getTime() + 60_000)), true);
});

test("Punkt 17: eine unbekannte Ordination wird abgewiesen", async () => {
  const pg = await db();
  // Der Fremdschluessel verhindert die Zeile. Das aeussert sich als Fehler, den
  // der Scheduler faengt und die Praxis ueberspringt - statt unkoordiniert zu
  // arbeiten.
  await assert.rejects(() =>
    pg.query("select try_claim_pms_sync($1,$2,$3,$4,$5) as ok", [
      "gibt-es-nicht",
      "vquadrat",
      "server-a",
      new Date(),
      new Date(Date.now() + 60_000),
    ]),
  );
  const rows = await pg.query<{ n: number }>(
    "select count(*)::int as n from pms_sync_lock where practice_id = 'gibt-es-nicht'",
  );
  assert.equal(rows.rows[0]?.n, 0, "keine Reservierung ohne Ordination");
});

test("Punkt 17: eine Reservierung laesst sich nicht doppelt anlegen", async () => {
  const pg = await db();
  const t0 = new Date("2026-09-17T13:00:00Z");
  const lease = new Date(t0.getTime() + 60_000);
  await claim(pg, "vier", "server-a", t0, lease);
  const rows = await pg.query<{ n: number }>(
    "select count(*)::int as n from pms_sync_lock where practice_id = 'p1' and pms_kind = 'vier'",
  );
  assert.equal(rows.rows[0]?.n, 1, "genau eine Zeile je Praxis und Programm");
});
