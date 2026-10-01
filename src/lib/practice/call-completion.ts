import type { Sql } from "@/lib/db";

/** Mark all persisted turns of one phone call complete and store its full duration. */
export async function completePhoneCall(sql: Sql, callRowId: string, callId: string): Promise<void> {
  await sql.query(
    `update calls
     set status = 'erledigt',
         duration_sec = greatest(0, extract(epoch from (
           now() - (
             select min(c.at) from calls c
             where c.practice_id = (select practice_id from calls where id = $1)
               and c.external_call_id = $2
           )
         ))::int)
     where practice_id = (select practice_id from calls where id = $1)
       and external_call_id = $2`,
    [callRowId, callId],
  );
}
