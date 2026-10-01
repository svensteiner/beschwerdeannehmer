import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { fetchEmergencyAudit, mapEmergencyAuditRow, recordEmergencyAudit } from "./emergency-audit.ts";

/** Minimal Sql adapter over a bare PGlite instance — same shape as board.test.ts. */
function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) => {
    const res = await pg.query<T>(text, params);
    return res.rows;
  };
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  }) as unknown as Sql;
  sql.query = (text: string, params: unknown[] = []) => run(text, params);
  return sql;
}

test("mapEmergencyAuditRow übersetzt emergency_id und ISO-Zeitpunkt", () => {
  const ev = mapEmergencyAuditRow({
    id: "ea1",
    emergency_id: "e1",
    at: new Date("2026-09-21T08:00:00.000Z"),
    actor: "silvia",
    status: "verbunden",
    note: "x",
  });
  assert.equal(ev.id, "ea1");
  assert.equal(ev.emergencyId, "e1");
  assert.equal(ev.at, "2026-09-21T08:00:00.000Z");
  assert.equal(ev.actor, "silvia");
  assert.equal(ev.status, "verbunden");
});

test("recordEmergencyAudit schreibt und fetchEmergencyAudit liest chronologisch", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.query(
    "create table emergency_audit (id text primary key, practice_id text not null, emergency_id text not null, at timestamptz not null default now(), actor text not null default '', status text not null default '', note text not null default '')",
  );
  const sql = sqlOf(pg);

  await recordEmergencyAudit(sql, "p1", "e1", "silvia", "verbunden", "geroutet");
  await recordEmergencyAudit(sql, "p1", "e1", "Lisa Kassa", "übernommen", "");

  const rows = await fetchEmergencyAudit(sql, "p1", "e1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actor, "silvia");
  assert.equal(rows[0].status, "verbunden");
  assert.equal(rows[1].actor, "Lisa Kassa");
  assert.equal(rows[1].status, "übernommen");

  // Scope: eine andere Praxis sieht nichts.
  const other = await fetchEmergencyAudit(sql, "p2", "e1");
  assert.equal(other.length, 0);

  await pg.close();
});
