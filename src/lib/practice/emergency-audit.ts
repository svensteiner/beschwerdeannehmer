import type { Sql } from "@/lib/db";

/**
 * Nachweiskette für Notfälle. Jeder Schritt — Silvia erkennt den Notfall und
 * routet ihn, die Praxis übernimmt oder schließt ihn ab — wird mit Zeitstempel
 * und Akteur in emergency_audit festgehalten. Ohne diese Kette war eine
 * Notfall-Eskalation nicht nachweisbar.
 */

export type EmergencyAuditRow = {
  id: string;
  emergency_id: string;
  at: string | Date;
  actor: string;
  status: string;
  note: string;
};

export type EmergencyAuditEvent = {
  id: string;
  emergencyId: string;
  at: string;
  actor: string;
  status: string;
  note: string;
};

export function mapEmergencyAuditRow(row: EmergencyAuditRow): EmergencyAuditEvent {
  return {
    id: row.id,
    emergencyId: row.emergency_id,
    at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
    actor: row.actor,
    status: row.status,
    note: row.note,
  };
}

/** Einen Nachweis-Eintrag schreiben. `actor`: "silvia" (automatisch) oder Nutzername. */
export async function recordEmergencyAudit(
  sql: Sql,
  practiceId: string,
  emergencyId: string,
  actor: string,
  status: string,
  note = "",
): Promise<void> {
  const { newId } = await import("./crypto");
  await sql`
    insert into emergency_audit (id, practice_id, emergency_id, actor, status, note)
    values (${`ea-${newId()}`}, ${practiceId}, ${emergencyId}, ${actor}, ${status}, ${note})
  `;
}

export async function fetchEmergencyAudit(
  sql: Sql,
  practiceId: string,
  emergencyId: string,
  limit = 20,
): Promise<EmergencyAuditRow[]> {
  const n = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  return sql<EmergencyAuditRow>`
    select id, emergency_id, at, actor, status, note
    from emergency_audit
    where practice_id = ${practiceId} and emergency_id = ${emergencyId}
    order by at asc
    limit ${n}
  `;
}
