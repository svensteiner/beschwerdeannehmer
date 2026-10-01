import type { Sql } from "@/lib/db";

/**
 * Buchungsschutz fuer unklare Ausgaenge.
 *
 * Der Schutz vor blindem Wiederholen lag nur im Arbeitsspeicher. Nach einem
 * Neustart oder nach Ablauf der 30 Minuten konnte derselbe Termin ein zweites
 * Mal geschrieben werden, obwohl der erste Ausgang unbekannt war - also
 * moeglicherweise schon gebucht.
 *
 * Punkt 1: Ein ausgefallener Schutz gibt die Buchung NICHT mehr frei. Vorher
 * lieferte ein Datenbankfehler „nicht gesperrt“ und die Buchung lief weiter:
 * genau dann, wenn unbekannt ist, ob schon geschrieben wurde, entstuende ein
 * zweiter Termin. Jetzt ist ein nicht pruefbarer Schutz ein eigenes Ergebnis,
 * das die Buchung ablehnt.
 */

/** Warum der Eintrag steht. */
export type BookingGuardReason =
  /** Der Schreibversuch laeuft oder brach ab - Ausgang unbekannt. */
  | "uncertain"
  /** Punkt 2: Absicht gesichert, BEVOR geschrieben wurde. */
  | "pending_write";

export type BookingGuardEntry = {
  callId: string;
  slotStart: string;
  reason: BookingGuardReason;
  createdAt: string;
};

/**
 * Ergebnis der Sperrpruefung.
 *
 * `unavailable` ist bewusst kein `clear`: laesst sich der Schutz nicht lesen,
 * darf nicht gebucht werden.
 */
export type BookingGuardStatus =
  | { kind: "clear" }
  | { kind: "blocked"; entry: BookingGuardEntry }
  | { kind: "unavailable" };

export type BookingGuard = {
  /**
   * Punkt 2: die Absicht sichern, BEVOR geschrieben wird.
   *
   * Bricht der Prozess zwischen Absicht und Ergebnis ab, steht der Eintrag
   * bereits — ein blindes Wiederholen ist danach ausgeschlossen.
   */
  beginWrite(input: { practiceId: string; callId: string; slotStart?: string }): Promise<boolean>;
  /** Merkt einen unklaren Ausgang nach einem Fehler. Wirft nie. */
  remember(input: { practiceId: string; callId: string; slotStart?: string }): Promise<void>;
  /** Hebt die Sperre auf (nach bestaetigtem Erfolg oder klarer Ablehnung). */
  forget(input: { practiceId: string; callId: string }): Promise<void>;
  /**
   * Punkt 1: der Zustand samt Grund. Ein Fehler ergibt `unavailable`, nicht
   * „frei“.
   */
  status(input: { practiceId: string; callId: string }): Promise<BookingGuardStatus>;
};

/** Arbeitsspeicher - Vorgabewert ohne Datenbank. */
export function memoryBookingGuard(): BookingGuard {
  const entries = new Map<string, BookingGuardEntry>();
  const key = (practiceId: string, callId: string) => `${practiceId}\u0000${callId}`;
  const set = (practiceId: string, callId: string, slotStart: string | undefined, reason: BookingGuardReason) => {
    entries.set(key(practiceId, callId), {
      callId,
      slotStart: String(slotStart ?? ""),
      reason,
      createdAt: new Date().toISOString(),
    });
  };
  return {
    async beginWrite({ practiceId, callId, slotStart }) {
      set(practiceId, callId, slotStart, "pending_write");
      return true;
    },
    async remember({ practiceId, callId, slotStart }) {
      set(practiceId, callId, slotStart, "uncertain");
    },
    async forget({ practiceId, callId }) {
      entries.delete(key(practiceId, callId));
    },
    async status({ practiceId, callId }) {
      const entry = entries.get(key(practiceId, callId));
      return entry ? { kind: "blocked", entry } : { kind: "clear" };
    },
  };
}

type GuardDbRow = { call_id: string; slot_start: string; reason: string; created_at: Date | string };

function toEntry(row: GuardDbRow): BookingGuardEntry {
  const reason: BookingGuardReason = row.reason === "pending_write" ? "pending_write" : "uncertain";
  return {
    callId: row.call_id,
    slotStart: String(row.slot_start ?? ""),
    reason,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Datenbank - traegt den Zustand ueber Neustarts.
 *
 * Punkt 1: Ein Fehler beim LESEN ergibt `unavailable`. Die Buchung wird dann
 * abgelehnt, denn genau in diesem Zustand ist unbekannt, ob schon ein Termin
 * geschrieben wurde. Schreiben und Loeschen duerfen weiterhin scheitern, ohne
 * zu werfen — ein misslungenes `forget` laesst den Eintrag stehen (sichere
 * Richtung), ein misslungenes `remember` meldet `false`.
 */
export function dbBookingGuard(sql: Sql): BookingGuard {
  const put = async (
    practiceId: string,
    callId: string,
    slotStart: string | undefined,
    reason: BookingGuardReason,
  ): Promise<boolean> => {
    try {
      await sql`
        insert into booking_guards (practice_id, call_id, slot_start, reason)
        values (${practiceId}, ${callId}, ${String(slotStart ?? "").slice(0, 64)}, ${reason})
        on conflict (practice_id, call_id) do update
          set slot_start = excluded.slot_start,
              reason = excluded.reason,
              created_at = now()
      `;
      return true;
    } catch {
      console.error("[booking-guard] Absicht nicht gesichert");
      return false;
    }
  };

  return {
    async beginWrite({ practiceId, callId, slotStart }) {
      // Punkt 2: Die Absicht wird festgehalten, BEVOR geschrieben wird. Ein
      // Absturz dazwischen laesst den Eintrag stehen statt nichts.
      return put(practiceId, callId, slotStart, "pending_write");
    },
    async remember({ practiceId, callId, slotStart }) {
      await put(practiceId, callId, slotStart, "uncertain");
    },
    async forget({ practiceId, callId }) {
      try {
        await sql`
          delete from booking_guards
          where practice_id = ${practiceId} and call_id = ${callId}
        `;
      } catch {
        // Bleibt liegen und laeuft mit der Aufbewahrung aus.
      }
    },
    async status({ practiceId, callId }) {
      try {
        const rows = await sql<GuardDbRow>`
          select call_id, slot_start, reason, created_at from booking_guards
          where practice_id = ${practiceId} and call_id = ${callId}
          limit 1
        `;
        const row = rows[0];
        return row ? { kind: "blocked", entry: toEntry(row) } : { kind: "clear" };
      } catch {
        // Punkt 1: NICHT „frei“ melden, sondern „nicht pruefbar“.
        console.error("[booking-guard] Schutz nicht pruefbar");
        return { kind: "unavailable" };
      }
    },
  };
}
