import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { dbBookingGuard, memoryBookingGuard } from "./booking-guard.ts";

/**
 * Buchungsschutz fuer unklare Ausgaenge.
 *
 * Punkt 1: Ein ausgefallener Schutz gibt die Buchung NICHT mehr frei.
 * Punkt 2: Die Absicht wird gesichert, BEVOR geschrieben wird.
 * Punkt 20: Der Neustart-Nachweis laeuft ueber ZWEI Prozesse, nicht ueber zwei
 *           Objekte in einem Prozess.
 */

test("Arbeitsspeicher-Sperre merkt, sperrt und vergisst", async () => {
  const guard = memoryBookingGuard();
  const input = { practiceId: "pa", callId: "call-1" };
  assert.deepEqual(await guard.status(input), { kind: "clear" }, "frisch nicht gesperrt");

  await guard.remember(input);
  const blocked = await guard.status(input);
  assert.equal(blocked.kind, "blocked");
  assert.equal(blocked.kind === "blocked" ? blocked.entry.reason : "", "uncertain");

  // Eine andere Ordination ist nicht betroffen.
  assert.deepEqual(await guard.status({ practiceId: "pb", callId: "call-1" }), { kind: "clear" });
  // Eine andere Anrufkennung ebenso wenig.
  assert.deepEqual(await guard.status({ practiceId: "pa", callId: "call-2" }), { kind: "clear" });

  await guard.forget(input);
  assert.deepEqual(await guard.status(input), { kind: "clear" }, "nach dem Aufheben wieder frei");
});

test("Punkt 2: beginWrite merkt die Absicht VOR dem Schreiben", async () => {
  const guard = memoryBookingGuard();
  const input = { practiceId: "pa", callId: "pre-1" };
  assert.equal(await guard.beginWrite({ ...input, slotStart: "2026-09-18T09:00:00" }), true);

  // Der Eintrag steht schon, obwohl noch nichts geschrieben wurde.
  const status = await guard.status(input);
  assert.equal(status.kind, "blocked");
  assert.equal(
    status.kind === "blocked" ? status.entry.reason : "",
    "pending_write",
    "die Absicht ist als solche gekennzeichnet",
  );
});

const NEEDED_MIGRATIONS = ["0001_silvia.sql", "0033_booking_guard.sql"];

let dbPromise: Promise<PGlite> | null = null;

function db(): Promise<PGlite> {
  dbPromise ??= (async () => {
    const pg = new PGlite();
    await pg.waitReady;
    for (const name of NEEDED_MIGRATIONS) {
      await pg.exec(await readFileSync(join(process.cwd(), "migrations", name), "utf8"));
    }
    return pg;
  })();
  return dbPromise;
}

function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  }) as unknown as Sql;
  sql.query = run;
  return sql;
}

test("Punkt 1: ein nicht pruefbarer Schutz meldet unavailable, nicht frei", async () => {
  // Ohne Tabelle (z. B. noch nicht migriert) ist unbekannt, ob schon
  // geschrieben wurde. Vorher kam hier „nicht gesperrt“ zurueck.
  const kaputt = (async () => {
    throw new Error("relation does not exist");
  }) as unknown as Sql;
  kaputt.query = async () => {
    throw new Error("relation does not exist");
  };
  const guard = dbBookingGuard(kaputt);

  const originalError = console.error;
  console.error = () => undefined;
  try {
    assert.deepEqual(
      await guard.status({ practiceId: "px", callId: "c" }),
      { kind: "unavailable" },
      "nicht pruefbar ist kein Freibrief",
    );
    // Diese beiden werfen weiterhin nicht.
    await guard.remember({ practiceId: "px", callId: "c" });
    await guard.forget({ practiceId: "px", callId: "c" });
    // Punkt 2: auch eine nicht sicherbare Absicht meldet false.
    assert.equal(await guard.beginWrite({ practiceId: "px", callId: "c" }), false);
  } finally {
    console.error = originalError;
  }
});

test("Punkt 3: der Grund der Sperre ist lesbar", async () => {
  const pg = await db();
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ('pg', 'Ordination', 'Dr. Test', 'pg@example.test') on conflict (id) do nothing",
  );
  const sql = sqlOf(pg);
  const guard = dbBookingGuard(sql);

  await guard.beginWrite({ practiceId: "pg", callId: "ext-1", slotStart: "2026-09-18T09:00:00" });
  const pending = await guard.status({ practiceId: "pg", callId: "ext-1" });
  assert.equal(pending.kind, "blocked");
  assert.equal(pending.kind === "blocked" ? pending.entry.reason : "", "pending_write");
  assert.equal(pending.kind === "blocked" ? pending.entry.slotStart : "", "2026-09-18T09:00:00");

  // Nach einem Fehler wird daraus der unklare Ausgang.
  await guard.remember({ practiceId: "pg", callId: "ext-1", slotStart: "2026-09-18T09:00:00" });
  const uncertain = await guard.status({ practiceId: "pg", callId: "ext-1" });
  assert.equal(uncertain.kind === "blocked" ? uncertain.entry.reason : "", "uncertain");

  await guard.forget({ practiceId: "pg", callId: "ext-1" });
  assert.deepEqual(await guard.status({ practiceId: "pg", callId: "ext-1" }), { kind: "clear" });
});

test("Punkt 20: die Sperre uebersteht einen ECHTEN Prozessneustart", async () => {
  // Zwei getrennte Node-Prozesse auf derselben Datenbank. Der erste schreibt
  // und endet, der zweite liest. Vorher erzeugte der Test nur ein zweites
  // Objekt im selben Prozess — das belegt keinen Neustart.
  const dir = mkdtempSync(join(tmpdir(), "silvia-guard-restart-"));
  const probe = join(process.cwd(), "scripts", "booking-guard-restart-probe.mjs");
  try {
    const write = spawnSync(process.execPath, [probe, dir, "write", "probe-p", "call-9"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(write.status, 0, `Schreibprozess fehlgeschlagen: ${write.stderr}`);
    assert.match(write.stdout, /written/);

    // Der Schreibprozess ist beendet; die Datenbank ist geschlossen.
    const read = spawnSync(process.execPath, [probe, dir, "status", "probe-p", "call-9"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(read.status, 0, `Leseprozess fehlgeschlagen: ${read.stderr}`);
    const result = JSON.parse(String(read.stdout).trim()) as {
      blocked: boolean;
      row: { reason: string; slot_start: string } | null;
    };
    assert.equal(result.blocked, true, "die Sperre steht nach dem Neustart");
    assert.equal(result.row?.reason, "pending_write");
    assert.equal(result.row?.slot_start, "2026-09-18T09:00:00");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
