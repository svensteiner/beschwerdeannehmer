import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { computeKpis, kpiWindow, viennaHour } from "./kpi.ts";

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

test("viennaHour rechnet UTC in die Wiener Stunde um (Winter/Summer)", () => {
  // Jänner: CET (UTC+1), Juli: CEST (UTC+2).
  assert.equal(viennaHour("2026-01-15T00:00:00.000Z"), 1);
  assert.equal(viennaHour("2026-07-15T00:00:00.000Z"), 2);
  assert.equal(viennaHour("2026-01-15T23:00:00.000Z"), 0);
});

test("kpiWindow beginnt days-1 Tage vor heute um Mitternacht", () => {
  const from = new Date(kpiWindow(30));
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(from.getSeconds(), 0);
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const diffDays = Math.round((todayMid.getTime() - from.getTime()) / 86_400_000);
  assert.equal(diffDays, 29);
});

test("computeKpis liefert echte Summen, Buchungsquote und Kanalgruppierung", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.query(
    "create table calls (id text primary key, practice_id text not null, channel text not null, at timestamptz not null, status text not null default 'offen', action text not null default '')",
  );
  await pg.query(
    "create table appointments (id text primary key, practice_id text not null, created_at timestamptz not null)",
  );
  await pg.query(
    "create table emergencies (id text primary key, practice_id text not null, at timestamptz not null)",
  );
  const sql = sqlOf(pg);
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  await sql`
    insert into calls (id, practice_id, channel, at, status, action) values
    (${"c1"}, ${"p1"}, ${"telefon"}, ${at(10)}, ${"offen"}, ${"Rückrufzettel"}),
    (${"c2"}, ${"p1"}, ${"telefon"}, ${at(20)}, ${"erledigt"}, ${"Rückrufzettel"}),
    (${"c3"}, ${"p1"}, ${"web"}, ${at(30)}, ${"offen"}, ${"Auskunft hinterlegt"})
  `;
  await sql`
    insert into appointments (id, practice_id, created_at) values
    (${"a1"}, ${"p1"}, ${at(5)})
  `;
  await sql`
    insert into emergencies (id, practice_id, at) values
    (${"e1"}, ${"p1"}, ${at(15)})
  `;

  const kpi = await computeKpis(sql, "p1", 30);

  assert.equal(kpi.calls, 3);
  assert.equal(kpi.appointments, 1);
  assert.equal(kpi.emergencies, 1);
  assert.equal(kpi.bookingRate, 1 / 3);
  // nur der offene Rückruf zählt (c1), c2 ist erledigt.
  assert.equal(kpi.openCallbacks, 1);

  const channelMap = new Map(kpi.byChannel.map((c) => [c.channel, c.calls]));
  assert.equal(channelMap.get("telefon"), 2);
  assert.equal(channelMap.get("web"), 1);

  const hourTotal = kpi.byHour.reduce((sum, h) => sum + h.calls, 0);
  assert.equal(hourTotal, 3);

  await pg.close();
});
