import type { Sql } from "@/lib/db";

type RememberFactResult =
  | { ok: true; id: string; fact: string; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Führt ausschließlich die atomare Datenbankoperation aus. Die Kennung wird
 * vom Server-Aufrufer übergeben, damit dieses Modul im Browser sicher bleibt.
 */
export async function rememberPracticeFactAtomically(
  sql: Pick<Sql, "query">,
  practiceId: string,
  fact: string,
  id: string,
): Promise<RememberFactResult> {
  const rows = await sql.query<{
    id: string | null;
    fact: string | null;
    duplicate: boolean;
    at_capacity: boolean;
  }>(
    "select id, fact, duplicate, at_capacity from remember_practice_fact_atomic($1, $2, $3)",
    [practiceId, fact, id],
  );
  const result = rows[0];
  if (!result) throw new Error("Hinweis konnte nicht gespeichert werden.");
  if (result.at_capacity) {
    return {
      ok: false,
      error:
        "Vierzig Hinweise reichen. Löschen Sie einen Hinweis direkt im Training.",
    };
  }
  return {
    ok: true,
    id: result.id!,
    fact: result.fact!,
    duplicate: result.duplicate,
  };
}
