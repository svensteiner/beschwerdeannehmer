import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "@/lib/db";

/**
 * Rückruf-Zentrale: alles, was Silvia nicht selbst abschliessen konnte und was
 * die Praxis zurueckrufen muss. Ein Ort fuer Rueckrufzettel, Warteliste,
 * Uebergabe an die Tierarzthelferin und Tafelkonflikte — inkl. Analyse,
 * warum der Anruf aus der Automatik herausfiel.
 */

export type CallbackReason = "rueckruf" | "warteliste" | "thea" | "konflikt";

export const CALLBACK_REASON_LABEL: Record<CallbackReason, string> = {
  rueckruf: "Rückruf",
  warteliste: "Warteliste",
  thea: "An die Tierarzthelferin",
  konflikt: "Tafelkonflikt",
};

/** Warum der Anruf nicht automatisch abgeschlossen wurde — oder null, wenn er es wurde. */
export function callbackReason(action: string): CallbackReason | null {
  const a = String(action ?? "");
  if (/rückruf/i.test(a)) return "rueckruf";
  if (a === "Warteliste") return "warteliste";
  if (a === "An die Tierarzthelferin") return "thea";
  if (/tafelkonflikt/i.test(a)) return "konflikt";
  return null;
}

export type OpenCallbackRow = {
  id: string;
  at: string | Date;
  caller: string;
  pet: string;
  concern: string;
  action: string;
  owner_phone: string;
  owner_email: string;
};

export type OpenCallback = {
  id: string;
  at: string;
  caller: string;
  pet: string;
  concern: string;
  phone: string;
  email: string;
  reason: CallbackReason;
};

export function mapOpenCallback(row: OpenCallbackRow): OpenCallback {
  return {
    id: row.id,
    at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
    caller: row.caller,
    pet: row.pet,
    concern: row.concern,
    phone: row.owner_phone,
    email: row.owner_email,
    reason: callbackReason(row.action) ?? "rueckruf",
  };
}

export async function fetchOpenCallbacks(
  sql: Sql,
  practiceId: string,
  limit = 200,
): Promise<OpenCallbackRow[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit) || 200));
  return sql<OpenCallbackRow>`
    select c.id, c.at,
      coalesce(
        nullif((
          select p.owner_name from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
            and p.owner_name <> '' and p.owner_name <> 'Klientel'
          limit 1
        ), ''),
        c.caller
      ) as caller,
      c.pet, c.concern, c.action,
      coalesce((
        select nullif(p.phone, '') from patients p
        where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
        limit 1
      ), '') as owner_phone,
      coalesce((
        select nullif(p.email, '') from patients p
        where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
        limit 1
      ), '') as owner_email
    from calls c
    where c.practice_id = ${practiceId}
      and c.status <> 'erledigt'
      and (
        c.action ilike '%rückruf%'
        or c.action = 'Warteliste'
        or c.action = 'An die Tierarzthelferin'
        or c.action ilike '%tafelkonflikt%'
      )
    order by c.at desc
    limit ${n}
  `;
}

export type CallbackAnalysis = {
  total: number;
  byReason: { reason: CallbackReason; count: number }[];
};

export function analyzeCallbacks(items: OpenCallback[]): CallbackAnalysis {
  const counts = new Map<CallbackReason, number>();
  for (const item of items) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const order: CallbackReason[] = ["rueckruf", "warteliste", "thea", "konflikt"];
  const byReason = order
    .map((reason) => ({ reason, count: counts.get(reason) ?? 0 }))
    .filter((entry) => entry.count > 0);
  return { total: items.length, byReason };
}

export const loadOpenCallbacks = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePractice } = await import("./session.server");
  const session = await requirePractice();
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  const rows = await fetchOpenCallbacks(sql, session.practiceId);
  const items = rows.map(mapOpenCallback);
  return { items, analysis: analyzeCallbacks(items) };
});
