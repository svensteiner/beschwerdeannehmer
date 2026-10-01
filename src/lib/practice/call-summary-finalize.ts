/**
 * AP 52: serverseitige Anbindung fuer die Anruf-Zusammenfassung. Rein
 * schreibend nach Anrufende — die reine Prompt-/Parse-Logik steckt in
 * @/lib/alma/call-summary, damit sie ohne PGlite in node:test lauffaehig bleibt.
 * Wird ausschliesslich fire-and-forget aus der Telefon-Bruecke aufgerufen,
 * darf also nie werfen und blockiert nie die Anrufantwort.
 *
 * Punkte 1-4: Die Zuordnung laeuft ueber die eigene Spalte `mails.call_id`
 * (exakt statt Teilstring), Zusammenfassung und Entwurf entstehen in EINER
 * Transaktion, und das Ergebnis unterscheidet „erledigt“ von „fehlgeschlagen“.
 */
import {
  mapAgreementKind,
  summarizeCall,
  summaryMailSubject,
  type SummaryAgreementKind,
} from "../alma/call-summary.ts";
import { shouldSummarize, type SummaryOutcome } from "./call-summary-dedupe.ts";

/**
 * Ermittelt die Zusammenfassung und schreibt sie MIT dem Mailentwurf in einer
 * Transaktion. Liefert ein Ergebnis statt zu werfen — der Aufrufer entscheidet,
 * was er protokolliert.
 *
 * Der Schreibvorgang liegt in `finalize_call_summary` (Migration 0030):
 * eine bedingte Aneignung plus Insert. Scheitert der Entwurf, faellt auch
 * `summary_at` zurueck und ein spaeterer Lauf darf es erneut versuchen.
 */
export async function finalizeCallSummary(input: {
  callRowId: string;
  lines: string[];
  phone?: string;
  callId: string;
  /** Gespeicherte Aktion der calls-Zeile, fuer Punkt 6/8. */
  agreement?: SummaryAgreementKind | null;
}): Promise<SummaryOutcome> {
  try {
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const rows = await sql<{
      practice_id: string;
      pet: string;
      summary_at: string | Date | null;
      action: string | null;
    }>`
      select practice_id, pet, summary_at, action from calls where id = ${input.callRowId} limit 1
    `;
    const row = rows[0];
    if (!row) return "failed";

    // Punkt 9: gezielt nach DIESER Kennung suchen. Vorher lud die Abfrage
    // saemtliche nicht leeren Mail-Kennungen der Praxis — bei einer grossen
    // Ordination unnoetig viel Speicher und Zeit.
    let hasDraftedCall = false;
    if (input.callId) {
      const drafted = await sql<{ id: string }>`
        select id from mails
        where practice_id = ${row.practice_id} and call_id = ${input.callId}
        limit 1
      `;
      hasDraftedCall = drafted.length > 0;
    }
    let hasSummarizedExternalCall = false;
    if (input.callId) {
      const summarized = await sql<{ id: string }>`
        select id from calls
        where practice_id = ${row.practice_id}
          and external_call_id = ${input.callId}
          and summary_at is not null
        limit 1
      `;
      hasSummarizedExternalCall = summarized.length > 0;
    }
    if (
      !shouldSummarize({
        callSummaryAt: row.summary_at,
        draftedCallIds: hasDraftedCall ? [input.callId] : [],
        callId: input.callId,
        hasSummarizedExternalCall,
      })
    ) {
      return "already";
    }

    const { llmChat } = await import("../alma/llm-runtime.ts");
    const summary = await summarizeCall({
      llm: async (prompt) => {
        const text = await llmChat([{ role: "user", content: prompt }]);
        if (!text) throw new Error("kein llm-Ergebnis");
        return text;
      },
      lines: input.lines,
      // Punkte 6 und 8: die Vereinbarungszeile richtet sich an der tatsaechlich
      // gespeicherten Aktion aus — ausdruecklich zugeordnet, nicht als freier
      // Text weitergereicht.
      agreement: mapAgreementKind(input.agreement ?? row.action),
    });
    // Punkt 5: eine Ablehnung des Modells ergibt hier "".
    if (!summary) return "empty";

    const { newId } = await import("./crypto");
    const now = new Date();
    const phoneLine = input.phone ? `\n\nRufnummer: ${input.phone}` : "";
    const subject = summaryMailSubject(now, input.callId);
    const body = `${summary}${phoneLine}`;

    const written = await sql<{ status: string }>`
      select finalize_call_summary(
        ${input.callRowId},
        ${summary},
        ${input.callId},
        ${subject},
        ${body},
        ${newId()}
      ) as status
    `;
    // Punkt 4: „stored“ heisst jetzt wirklich: Zusammenfassung UND neuer
    // Entwurf. Legte der eindeutige Index den Entwurf nicht an, meldet die
    // Funktion „already“ statt eines scheinbaren Erfolgs.
    const status = String(written[0]?.status ?? "");
    if (status === "stored") return "stored";
    if (status === "already") return "already";
    return "failed";
  } catch {
    return "failed";
  }
}
