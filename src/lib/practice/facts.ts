import { createServerFn } from "@tanstack/react-start";
import { extractTrainFact } from "@/lib/alma/train";

export type PracticeFact = { id: string; fact: string; at: string };

export const loadPracticeFacts = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readPracticeSession } = await import("./session.server");
    const session = await readPracticeSession();
    if (!session) return { ok: false as const, facts: [] as PracticeFact[] };
    const { fetchFacts } = await import("./facts.server");
    return { ok: true as const, facts: await fetchFacts(session.practiceId) };
  },
);

export const rememberPracticeFact = createServerFn({ method: "POST" })
  .validator((input: { fact?: string }) => ({
    fact: extractTrainFact(String(input?.fact ?? "")),
  }))
  .handler(async ({ data }) => {
    if (data.fact.length < 8) {
      return { ok: false as const, error: "Das ist zu kurz zum Merken." };
    }
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { rememberFact } = await import("./facts.server");
    const { randomUUID } = await import("node:crypto");
    return rememberFact(
      session.practiceId,
      data.fact,
      randomUUID(),
    );
  });

/**
 * Ersetzt einen bereits gespeicherten Hinweis. Das ist wichtig für die
 * Sprachschulung: Eine nachträgliche Korrektur darf nicht zusätzlich als
 * zweite, widersprüchliche Praxisregel gespeichert werden.
 */
export const replacePracticeFact = createServerFn({ method: "POST" })
  .validator((input: { id?: string; fact?: string; expectedFact?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    fact: extractTrainFact(String(input?.fact ?? "")),
    expectedFact: String(input?.expectedFact ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.id)
      return { ok: false as const, error: "Hinweis nicht gefunden." };
    if (!data.expectedFact)
      return { ok: false as const, error: "Bitte laden Sie den Hinweis neu, bevor Sie ihn korrigieren. Ihre Korrektur wurde nicht gespeichert." };
    if (data.fact.length < 8) {
      return { ok: false as const, error: "Das ist zu kurz zum Merken." };
    }
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { replaceFact } = await import("./facts.server");
    const merged = await replaceFact(
      data.id,
      session.practiceId,
      data.fact,
      data.expectedFact,
    );
    if (!merged)
      return { ok: false as const, error: "Hinweis nicht gefunden." };
    if (merged.conflict)
      return { ok: false as const, error: "Der Hinweis wurde inzwischen geändert. Bitte neu laden; Ihre Korrektur wurde nicht gespeichert." };
    return {
      ok: true as const,
      id: merged.id,
      fact: merged.fact,
      duplicate: merged.duplicate,
    };
  });

export const forgetPracticeFact = createServerFn({ method: "POST" })
  .validator((input: { id?: string; expectedFact?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    expectedFact: String(input?.expectedFact ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.id)
      return { ok: false as const, error: "Hinweis nicht gefunden." };
    if (!data.expectedFact)
      return { ok: false as const, error: "Hinweis wurde geändert oder bereits gelöscht. Bitte neu laden." };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { deleteFact } = await import("./facts.server");
    const deleted = await deleteFact(
      data.id,
      session.practiceId,
      data.expectedFact,
    );
    if (!deleted)
      return { ok: false as const, error: "Hinweis wurde geändert oder bereits gelöscht. Bitte neu laden." };
    return { ok: true as const };
  });
