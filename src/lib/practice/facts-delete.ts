import type { Sql } from "@/lib/db";

export async function deleteFactGuarded(
  sql: Pick<Sql, "query">,
  id: string,
  practiceId: string,
  expectedFact: string,
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    "delete from practice_facts where id = $1 and practice_id = $2 and fact = $3 returning id",
    [id, practiceId, expectedFact],
  );
  return rows.length > 0;
}
