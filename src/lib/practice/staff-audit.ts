import type { Sql } from "@/lib/db";
import { newId } from "./crypto.ts";

/**
 * Aenderungsprotokoll fuer sicherheitsrelevante Zugangsaktionen (Punkt 6).
 *
 * Anlegen, Entfernen und Passwort-Zuruecksetzen einer Kollegin waren bisher
 * nirgends nachvollziehbar. Wer wann einen Zugang angelegt oder entzogen hat,
 * ist die Frage, die bei einem Vorfall zuerst gestellt wird.
 *
 * Bewusst OHNE Geheimnisse: kein Passwort, kein Hash, kein Ruecksetzcode. Die
 * Ziel-E-Mail gehoert der Ordination selbst.
 */

export const STAFF_AUDIT_ACTIONS = [
  "invited",
  "removed",
  "reset_password",
  "changed_password",
] as const;

export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

/** Unbekannte Aktionen werden nicht gespeichert statt roh durchgereicht. */
export function sanitizeStaffAuditAction(raw: string): StaffAuditAction | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (STAFF_AUDIT_ACTIONS as readonly string[]).includes(value)
    ? (value as StaffAuditAction)
    : null;
}

export type StaffAuditInput = {
  practiceId: string;
  actorId: string;
  action: StaffAuditAction;
  targetId?: string;
  targetEmail?: string;
};

/**
 * Protokolliert eine Aktion. Wirft nie: ein Protokolleintrag darf die
 * eigentliche Handlung nicht scheitern lassen.
 *
 * `false` heisst: NICHT protokolliert. Das wird hier sichtbar gemeldet, denn
 * eine sicherheitsrelevante Aktion ohne Eintrag ist genau der Fall, den bei
 * einem Vorfall niemand bemerkt. Der Aufrufer entscheidet, ob er es zusaetzlich
 * weitergibt.
 */
export async function recordStaffAction(sql: Sql, input: StaffAuditInput): Promise<boolean> {
  const action = sanitizeStaffAuditAction(input.action);
  if (!action) return false;
  try {
    await sql`
      insert into practice_staff_audit (id, practice_id, actor_id, action, target_id, target_email)
      values (
        ${newId()},
        ${input.practiceId},
        ${input.actorId},
        ${action},
        ${String(input.targetId ?? "").slice(0, 80)},
        ${String(input.targetEmail ?? "").trim().toLowerCase().slice(0, 160)}
      )
    `;
    return true;
  } catch {
    // Ohne PII: nur die Aktion, nicht die Adresse.
    console.error(`[staff-audit] Aktion nicht protokolliert: ${action}`);
    return false;
  }
}
