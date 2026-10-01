import type { Sql } from "@/lib/db";

export async function saveLead(sql: Sql, input: { id: string; requestId?: string; payloadHash?: string; practice: string; contact: string; email: string; phone: string; bundesland: string; pms: string; message: string }) {
  if (!input.requestId) {
    await sql`insert into leads (id, practice_name, contact, email, phone, bundesland, pms, message) values (${input.id}, ${input.practice}, ${input.contact}, ${input.email}, ${input.phone}, ${input.bundesland}, ${input.pms}, ${input.message})`;
    return input.id;
  }
  const rows = await sql<{ id: string; request_payload_hash: string }>`
    insert into leads (id, request_id, request_payload_hash, practice_name, contact, email, phone, bundesland, pms, message)
    values (${input.id}, ${input.requestId}, ${input.payloadHash}, ${input.practice}, ${input.contact}, ${input.email}, ${input.phone}, ${input.bundesland}, ${input.pms}, ${input.message})
    on conflict (request_id) do update set request_id = excluded.request_id
      where leads.request_payload_hash = excluded.request_payload_hash
    returning id, request_payload_hash
  `;
  if (rows[0]) return rows[0].request_payload_hash === input.payloadHash ? rows[0].id : null;
  return null;
}
