import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

type OutcomeRow = { outcome: string };

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const migration of [
    "0001_silvia.sql",
    "0005_appointment_status.sql",
    "0023_appointment_slot_atomic.sql",
    "0024_appointment_status_atomic.sql",
  ]) {
    await pg.exec(await readFile(`migrations/${migration}`, "utf8"));
  }
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)",
    ["practice-a", "Ordination A", "Frau Doktor", "a@example.test"],
  );
  return pg;
}

async function reserve(pg: PGlite, id: string, start: string, status = "gelegt") {
  return (await pg.query<OutcomeRow>(
    "select reserve_appointment_slot_atomic($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10) as outcome",
    [id, "practice-a", start, 20, "Frau Test", id, "Kontrolle", "Frau Doktor", "kassa", status],
  )).rows[0]?.outcome;
}

async function move(
  pg: PGlite,
  id: string,
  expected: string,
  target: string,
  expectedStatus = "gelegt",
  nextStatus = "gelegt",
) {
  return (await pg.query<OutcomeRow>(
    "select move_appointment_slot_atomic($1, $2, $3::timestamptz, $4, $5::timestamptz, $6) as outcome",
    [id, "practice-a", expected, expectedStatus, target, nextStatus],
  )).rows[0]?.outcome;
}

async function updateStatus(pg: PGlite, id: string, expected: string, expectedStatus: string, nextStatus: string) {
  return (await pg.query<OutcomeRow>(
    "select update_appointment_status_atomic($1, $2, $3::timestamptz, $4, $5) as outcome",
    [id, "practice-a", expected, expectedStatus, nextStatus],
  )).rows[0]?.outcome;
}

test("atomare Walk-ins vergeben einen parallelen Slot nur einmal", async () => {
  const pg = await fixture();
  try {
    const start = "2026-10-20T10:00:00+02:00";
    const outcomes = await Promise.all([reserve(pg, "a", start), reserve(pg, "b", start)]);
    assert.deepEqual(outcomes.sort(), ["applied", "conflict"]);
    const rows = await pg.query<{ count: number }>(
      "select count(*)::int as count from appointments where practice_id = $1 and start_at = $2::timestamptz",
      ["practice-a", start],
    );
    assert.equal(rows.rows[0]?.count, 1);
  } finally {
    await pg.close();
  }
});

test("atomare Umlegungen verhindern Doppelbelegung und stale Überschreiben", async () => {
  const pg = await fixture();
  try {
    const first = "2026-10-20T09:00:00+02:00";
    const second = "2026-10-20T09:20:00+02:00";
    const target = "2026-10-20T10:00:00+02:00";
    assert.equal(await reserve(pg, "a", first), "applied");
    assert.equal(await reserve(pg, "b", second), "applied");
    const outcomes = await Promise.all([move(pg, "a", first, target), move(pg, "b", second, target)]);
    assert.deepEqual(outcomes.sort(), ["applied", "conflict"]);
    const stale = await move(pg, "a", first, "2026-10-20T11:00:00+02:00");
    assert.equal(stale, "stale");
  } finally {
    await pg.close();
  }
});

test("Reaktivieren als bestätigt prüft den Slot atomar", async () => {
  const pg = await fixture();
  try {
    const slot = "2026-10-20T10:00:00+02:00";
    assert.equal(await reserve(pg, "active", slot), "applied");
    assert.equal(await reserve(pg, "cancelled", slot, "abgesagt"), "applied");

    assert.equal(await move(pg, "cancelled", slot, slot, "abgesagt", "bestätigt"), "conflict");
    const unchanged = await pg.query<{ status: string }>("select status from appointments where id = $1", ["cancelled"]);
    assert.equal(unchanged.rows[0]?.status, "abgesagt");

    assert.equal(
      await move(pg, "cancelled", slot, "2026-10-20T11:00:00+02:00", "abgesagt", "bestätigt"),
      "applied",
    );
  } finally {
    await pg.close();
  }
});

test("atomare Statuswechsel verwerfen eine veraltete Ansicht", async () => {
  const pg = await fixture();
  try {
    const start = "2026-10-20T10:00:00+02:00";
    assert.equal(await reserve(pg, "status", start), "applied");
    const outcomes = await Promise.all([
      updateStatus(pg, "status", start, "gelegt", "bestätigt"),
      updateStatus(pg, "status", start, "gelegt", "abgesagt"),
    ]);
    assert.deepEqual(outcomes.sort(), ["applied", "stale"]);
    const row = await pg.query<{ start_at: string; status: string }>(
      "select start_at, status from appointments where id = $1",
      ["status"],
    );
    assert.equal(new Date(row.rows[0]?.start_at ?? "").toISOString(), "2026-10-20T08:00:00.000Z");
    assert.ok(["bestätigt", "abgesagt"].includes(row.rows[0]?.status ?? ""));
  } finally {
    await pg.close();
  }
});
