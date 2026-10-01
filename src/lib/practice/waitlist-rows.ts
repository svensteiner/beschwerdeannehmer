import type { Sql } from "@/lib/db";

export type WaitlistRow = {
  id: string;
  at: string | Date;
  caller: string;
  phone: string;
  pet: string;
  concern: string;
  requested_date: string;
  status: string;
};

export type DeskWaitlistEntry = {
  id: string;
  at: string;
  caller: string;
  phone: string;
  pet: string;
  concern: string;
  requestedDate: string;
  status: string;
};

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function mapWaitlistRow(w: WaitlistRow): DeskWaitlistEntry {
  return {
    id: w.id,
    at: asIso(w.at),
    caller: w.caller,
    phone: w.phone,
    pet: w.pet,
    concern: w.concern,
    requestedDate: w.requested_date,
    status: w.status,
  };
}

/** Newest waitlist entries for the Tafel. */
export async function fetchPracticeWaitlist(
  sql: Sql,
  practiceId: string,
  opts: { limit: number },
): Promise<WaitlistRow[]> {
  const limit = Math.max(1, Math.min(80, Math.floor(opts.limit) || 40));
  return sql<WaitlistRow>`
    select id, at, caller, phone, pet, concern, requested_date, status
    from waitlist
    where practice_id = ${practiceId}
    order by at desc
    limit ${limit}
  `;
}
