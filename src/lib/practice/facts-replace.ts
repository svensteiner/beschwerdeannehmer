import type { Sql } from "@/lib/db";

type ReplaceRow = { id: string; fact: string; duplicate: boolean };
type GuardedReplaceRow = ReplaceRow & { conflict: boolean };

/**
 * Ersetzt einen Praxis-Hinweis atomar: Die Quell-ID bleibt erhalten, während
 * ein gleichlautender Hinweis derselben Praxis entfernt wird.
 */
export async function replaceFactAtomically(
  sql: Pick<Sql, "query">,
  id: string,
  practiceId: string,
  fact: string,
): Promise<ReplaceRow | null> {
  const rows = await sql.query<ReplaceRow>(
    "select id, fact, duplicate from replace_practice_fact_atomic($1, $2, $3)",
    [id, practiceId, fact],
  );
  return rows[0] ?? null;
}

/** Optimistic concurrency guard: replaces only if the caller still has the expected text. */
export async function replaceFactGuarded(
  sql: Pick<Sql, "query">,
  id: string,
  practiceId: string,
  fact: string,
  expectedFact: string,
): Promise<GuardedReplaceRow | null> {
  const rows = await sql.query<GuardedReplaceRow>(
    "select id, fact, duplicate, conflict from replace_practice_fact_guarded($1, $2, $3, $4)",
    [id, practiceId, fact, expectedFact],
  );
  return rows[0] ?? null;
}
