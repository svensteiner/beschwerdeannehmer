import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "@/lib/db";

/**
 * Echte Kennzahlen der Praxis aus calls/appointments/emergencies — keine
 * Demo-Zahlen. Die Stunde wird in Wien (Europe/Vienna) gruppiert, damit die
 * Spitzenzeiten zur Ordination passen, nicht zur Server-UTC.
 */

export type KpiSummary = {
  periodDays: number;
  from: string;
  calls: number;
  appointments: number;
  emergencies: number;
  /** 0..1 — Anteil der Gespräche, aus denen ein Termin entstand. */
  bookingRate: number;
  openCallbacks: number;
  byHour: { hour: number; calls: number }[];
  byChannel: { channel: string; calls: number }[];
};

type KpiTotalsRow = {
  calls: number;
  appointments: number;
  emergencies: number;
  open_callbacks: number;
};

/** Start der Auswertung: heute minus (days - 1), auf Mitternacht gerundet. */
export function kpiWindow(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days + 1);
  return from.toISOString();
}

/** Stunde (0..23) eines Zeitpunkts in Europe/Vienna, ohne SQL-Tz-Abhaengigkeit. */
export function viennaHour(value: string | Date): number {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(+d)) return -1;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const raw = parts.find((p) => p.type === "hour")?.value;
  if (raw == null) return -1;
  return Number(raw) % 24;
}

export async function computeKpis(
  sql: Sql,
  practiceId: string,
  days = 30,
): Promise<KpiSummary> {
  const from = kpiWindow(days);

  const totals = await sql<KpiTotalsRow>`
    select
      (select count(*)::int from calls where practice_id = ${practiceId} and at >= ${from}) as calls,
      (select count(*)::int from appointments where practice_id = ${practiceId} and created_at >= ${from}) as appointments,
      (select count(*)::int from emergencies where practice_id = ${practiceId} and at >= ${from}) as emergencies,
      (select count(*)::int from calls where practice_id = ${practiceId} and status <> 'erledigt' and action ilike '%rückruf%') as open_callbacks
  `;

  const callTimes = await sql<{ at: string | Date }>`
    select at from calls where practice_id = ${practiceId} and at >= ${from}
  `;

  const channels = await sql<{ channel: string; calls: number }>`
    select channel, count(*)::int as calls
    from calls where practice_id = ${practiceId} and at >= ${from}
    group by channel order by calls desc
  `;

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0 }));
  for (const row of callTimes) {
    const hour = viennaHour(row.at);
    if (hour >= 0 && hour < 24) byHour[hour].calls += 1;
  }

  const t = totals[0] ?? {
    calls: 0,
    appointments: 0,
    emergencies: 0,
    open_callbacks: 0,
  };

  return {
    periodDays: days,
    from,
    calls: t.calls,
    appointments: t.appointments,
    emergencies: t.emergencies,
    bookingRate: t.calls > 0 ? t.appointments / t.calls : 0,
    openCallbacks: t.open_callbacks,
    byHour,
    byChannel: channels.map((c) => ({ channel: c.channel, calls: c.calls })),
  };
}

export const loadPracticeKpis = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePractice } = await import("./session.server");
  const session = await requirePractice();
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  return computeKpis(sql, session.practiceId, 30);
});
