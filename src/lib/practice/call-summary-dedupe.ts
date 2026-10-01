/**
 * AP 55 / Punkt 1: reine Entscheidungslogik, ob eine Anruf-Zusammenfassung
 * (noch) erzeugt werden darf. Getrennt von call-summary-finalize.ts
 * (DB-Zugriff), damit sie ohne PGlite in node:test lauffaehig ist.
 *
 * Vorher lief die Zuordnung ueber `mail.subject.includes(callId)`. Eine
 * Anrufkennung "12" steckt auch in "3124": ein Entwurf fuer 3124 liess den
 * Anruf 12 faelschlich als erledigt gelten und die Zusammenfassung entfiel.
 * Jetzt wird die Kennung EXAKT verglichen.
 */

/** Ergebnis einer Zusammenfassungs-Anfrage. */
export type SummaryOutcome =
  /** Gespeichert. */
  | "stored"
  /** War schon erledigt — kein Fehler. */
  | "already"
  /** Technisch fehlgeschlagen. */
  | "failed"
  /** Nichts Brauchbares erzeugt (leeres Transkript oder Ablehnung des Modells). */
  | "empty";

/**
 * Punkt 4 — „bereits erledigt“ von „fehlgeschlagen“ unterscheiden.
 *
 * Beide ergaben vorher `false`, und der Aufrufer protokollierte in beiden
 * Faellen „Zusammenfassung nicht gespeichert“. Ein bereits erledigter Anruf sah
 * damit wie ein Fehler aus.
 */
export function summaryOutcomeFailed(outcome: SummaryOutcome): boolean {
  return outcome === "failed";
}

/** Eine erledigte Zusammenfassung ist kein Fehler und kein neuer Versuch. */
export function summaryOutcomeDone(outcome: SummaryOutcome): boolean {
  return outcome === "stored" || outcome === "already";
}

export function summaryOutcomeLine(outcome: SummaryOutcome): string {
  switch (outcome) {
    case "stored":
      return "Zusammenfassung gespeichert";
    case "already":
      return "Zusammenfassung war schon da";
    case "empty":
      return "keine brauchbare Zusammenfassung erzeugt";
    case "failed":
      return "Zusammenfassung fehlgeschlagen";
    default: {
      const never: never = outcome;
      return String(never);
    }
  }
}

export function shouldSummarize(input: {
  /** calls.summary_at der Zeile, auf die diese Zusammenfassung geschrieben werden soll. */
  callSummaryAt: string | Date | null | undefined;
  /**
   * Anrufkennungen, fuer die diese Praxis schon einen Entwurf hat.
   * Exakter Vergleich, kein Teilstring.
   */
  draftedCallIds: string[];
  /** Externe Anruf-ID dieses Anrufs. */
  callId: string;
  /** AP 56: true, wenn eine calls-Zeile dieser Praxis mit derselben
   * external_call_id bereits summary_at gesetzt hat. */
  hasSummarizedExternalCall?: boolean;
}): boolean {
  if (input.callSummaryAt) return false;
  if (input.hasSummarizedExternalCall) return false;
  const callId = String(input.callId ?? "").trim();
  // Ohne Kennung gibt es nichts zu vergleichen; die Zeile selbst entscheidet.
  if (!callId) return true;
  return !input.draftedCallIds.some((drafted) => String(drafted ?? "").trim() === callId);
}
