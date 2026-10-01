import { getSql } from "@/lib/db.server";
import { rememberPracticeFactAtomically } from "./facts-create";
import { replaceFactGuarded } from "./facts-replace";
import { deleteFactGuarded } from "./facts-delete";

export type PracticeFact = { id: string; fact: string; at: string };

export async function fetchFacts(practiceId: string): Promise<PracticeFact[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    fact: string;
    created_at: string | Date;
  }>`
    select id, fact, created_at from practice_facts
    where practice_id = ${practiceId}
    order by created_at desc
    limit 40
  `;
  return rows.map((r) => ({
    id: r.id,
    fact: r.fact,
    at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  }));
}

export async function rememberFact(practiceId: string, fact: string, id: string) {
  return rememberPracticeFactAtomically(await getSql(), practiceId, fact, id);
}

export async function replaceFact(
  id: string,
  practiceId: string,
  fact: string,
  expectedFact: string,
) {
  return replaceFactGuarded(await getSql(), id, practiceId, fact, expectedFact);
}

export async function deleteFact(id: string, practiceId: string, expectedFact: string) {
  return deleteFactGuarded(await getSql(), id, practiceId, expectedFact);
}
