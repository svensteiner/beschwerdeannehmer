/**
 * Hilfsprozess fuer den Neustart-Nachweis (Punkt 20).
 *
 * Oeffnet die PGLite-Datenbank auf dem uebergebenen Ordner, wendet die
 * noetigen Migrationen an und fuehrt EINE Aktion aus. Der Prozess endet danach.
 *
 * Damit laesst sich echt pruefen, ob der Buchungsschutz einen Neustart
 * uebersteht: erst schreiben, Prozess beenden, neuer Prozess liest.
 *
 * Aufruf: node scripts/booking-guard-restart-probe.mjs <dir> <write|status> <practiceId> <callId>
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const [dir, mode, practiceId, callId] = process.argv.slice(2);
if (!dir || !mode || !practiceId || !callId) {
  console.error("usage: probe <dir> <write|status> <practiceId> <callId>");
  process.exit(2);
}

const root = resolve(process.cwd());
const pg = new PGlite(resolve(dir));
await pg.waitReady;

// Nur die Tabellen, die dieser Nachweis braucht.
for (const name of ["0001_silvia.sql", "0033_booking_guard.sql"]) {
  await pg.exec(await readFile(join(root, "migrations", name), "utf8"));
}

if (mode === "write") {
  // Die Ordination zuerst: practice_users verweist darauf.
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ('probe-p', 'Probe', 'Dr. Probe', 'probe@example.test') on conflict do nothing",
  );
  await pg.query(
    "insert into practice_users (id, practice_id, email, password_hash, name, role) values ('probe-u', 'probe-p', 'probe@example.test', 'h', 'Probe', 'inhaberin') on conflict do nothing",
  );
  await pg.query(
    `insert into booking_guards (practice_id, call_id, slot_start, reason)
     values ($1, $2, $3, 'pending_write')
     on conflict (practice_id, call_id) do update set reason = 'pending_write'`,
    [practiceId, callId, "2026-09-18T09:00:00"],
  );
  console.log("written");
} else {
  const rows = await pg.query(
    "select call_id, reason, slot_start from booking_guards where practice_id = $1 and call_id = $2",
    [practiceId, callId],
  );
  console.log(JSON.stringify({ blocked: rows.rows.length > 0, row: rows.rows[0] ?? null }));
}

await pg.close();
