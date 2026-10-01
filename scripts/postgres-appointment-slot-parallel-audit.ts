import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { safeLocalPostgresAuditUrl } from "./postgres-audit-safety.mjs";

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = [
  "0001_silvia.sql",
  "0005_appointment_status.sql",
  "0023_appointment_slot_atomic.sql",
  "0024_appointment_status_atomic.sql",
] as const;
const LOCK_PROOF_MS = 150;

type OutcomeRow = { outcome: string };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function assertStillPending(promise: Promise<unknown>, description: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    promise.then(() => "settled", () => "settled"),
    new Promise<"pending">((resolve) => {
      timeout = setTimeout(() => resolve("pending"), LOCK_PROOF_MS);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  assert.equal(result, "pending", `${description} war nicht an der PostgreSQL-Sperre blockiert.`);
}

async function reserve(
  client: InstanceType<typeof Client>,
  practiceId: string,
  id: string,
  start: string,
  onQuery?: () => void,
) {
  onQuery?.();
  const rows = await client.query<OutcomeRow>(
    "select reserve_appointment_slot_atomic($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10) as outcome",
    [id, practiceId, start, 20, "Audit", id, "Kontrolle", "Audit", "audit", "gelegt"],
  );
  return rows.rows[0]?.outcome;
}

async function move(
  client: InstanceType<typeof Client>,
  practiceId: string,
  id: string,
  expected: string,
  target: string,
  onQuery?: () => void,
) {
  onQuery?.();
  const rows = await client.query<OutcomeRow>(
    "select move_appointment_slot_atomic($1, $2, $3::timestamptz, $4, $5::timestamptz, $6) as outcome",
    [id, practiceId, expected, "gelegt", target, "gelegt"],
  );
  return rows.rows[0]?.outcome;
}

async function updateStatus(
  client: InstanceType<typeof Client>,
  practiceId: string,
  id: string,
  expected: string,
  expectedStatus: string,
  nextStatus: string,
  onQuery?: () => void,
) {
  onQuery?.();
  const rows = await client.query<OutcomeRow>(
    "select update_appointment_status_atomic($1, $2, $3::timestamptz, $4, $5) as outcome",
    [id, practiceId, expected, expectedStatus, nextStatus],
  );
  return rows.rows[0]?.outcome;
}

async function runScenario(connectionString: string) {
  const schema = `appointment_audit_${randomUUID().replaceAll("-", "")}`;
  const practiceId = `appointment-audit-${randomUUID()}`;
  const primary = new Client({ connectionString });
  const secondary = new Client({ connectionString });
  let schemaCreated = false;
  let transactionOpen = false;

  try {
    await Promise.all([primary.connect(), secondary.connect()]);
    await primary.query(`create schema "${schema}"`);
    schemaCreated = true;
    await Promise.all([
      primary.query(`set search_path to "${schema}"`),
      secondary.query(`set search_path to "${schema}"`),
    ]);
    for (const migration of MIGRATIONS) {
      await primary.query(await readFile(join(PROJECT_ROOT, "migrations", migration), "utf8"));
    }
    await primary.query(
      "insert into practices (id, name, owner_name, email) values ($1, 'Audit', 'Audit', 'audit@example.invalid')",
      [practiceId],
    );

    const sharedStart = "2026-10-20T10:00:00+02:00";
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [practiceId]);
    assert.equal(await reserve(primary, practiceId, "walkin-a", sharedStart), "applied");
    const reservationReached = deferred();
    const reservation = reserve(secondary, practiceId, "walkin-b", sharedStart, reservationReached.resolve);
    await reservationReached.promise;
    await assertStillPending(reservation, "Zweiter Walk-in");
    await primary.query("commit");
    transactionOpen = false;
    assert.equal(await reservation, "conflict");

    const firstStart = "2026-10-21T09:00:00+02:00";
    const secondStart = "2026-10-21T09:20:00+02:00";
    const target = "2026-10-21T10:00:00+02:00";
    assert.equal(await reserve(primary, practiceId, "move-a", firstStart), "applied");
    assert.equal(await reserve(primary, practiceId, "move-b", secondStart), "applied");
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [practiceId]);
    assert.equal(await move(primary, practiceId, "move-a", firstStart, target), "applied");
    const moveReached = deferred();
    const competingMove = move(secondary, practiceId, "move-b", secondStart, target, moveReached.resolve);
    await moveReached.promise;
    await assertStillPending(competingMove, "Zweites Umlegen");
    await primary.query("commit");
    transactionOpen = false;
    assert.equal(await competingMove, "conflict");
    assert.equal(await move(primary, practiceId, "move-a", firstStart, "2026-10-21T11:00:00+02:00"), "stale");

    const statusStart = "2026-10-22T09:00:00+02:00";
    assert.equal(await reserve(primary, practiceId, "status", statusStart), "applied");
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [practiceId]);
    assert.equal(await updateStatus(primary, practiceId, "status", statusStart, "gelegt", "bestätigt"), "applied");
    const statusReached = deferred();
    const competingStatus = updateStatus(
      secondary,
      practiceId,
      "status",
      statusStart,
      "gelegt",
      "abgesagt",
      statusReached.resolve,
    );
    await statusReached.promise;
    await assertStillPending(competingStatus, "Zweiter Statuswechsel");
    await primary.query("commit");
    transactionOpen = false;
    assert.equal(await competingStatus, "stale");

    const rows = await primary.query<{ count: number }>(
      "select count(*)::int as count from appointments where practice_id = $1 and start_at = $2::timestamptz",
      [practiceId, target],
    );
    assert.equal(rows.rows[0]?.count, 1, "Der Zielslot darf nur einmal belegt sein.");
  } finally {
    if (transactionOpen) await primary.query("rollback").catch(() => undefined);
    await Promise.allSettled([primary.end(), secondary.end()]);
    if (schemaCreated) {
      const cleanup = new Client({ connectionString });
      try {
        await cleanup.connect();
        await cleanup.query(`drop schema if exists "${schema}" cascade`);
      } finally {
        await cleanup.end().catch(() => undefined);
      }
    }
  }
}

const rawUrl = process.env.APPOINTMENT_AUDIT_DATABASE_URL;
const connectionString = safeLocalPostgresAuditUrl(rawUrl);
const required = process.env.APPOINTMENT_AUDIT_REQUIRED === "1";

if (!rawUrl) {
  const message = "APPOINTMENT_AUDIT_DATABASE_URL fehlt; keine Datenbank wurde kontaktiert.";
  if (required) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`SKIP: ${message}`);
  }
} else if (!connectionString) {
  console.error("REFUSE: Nur lokale PostgreSQL-Testdatenbanken silvia_audit_* sind erlaubt.");
  process.exitCode = 1;
} else {
  try {
    await runScenario(connectionString);
    console.log("PASS: PostgreSQL-Termine parallel, konfliktfrei sowie Status- und Slot-Änderungen stale-sicher geprüft.");
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
