import type { Sql } from "@/lib/db";
import { internContactMatchPets, internProtocolPet } from "../alma/protocol.ts";

/** Intern thread for Frau Doktor plus the matching mail draft. */
export async function writeInternProtocol(
  sql: Sql,
  input: {
    practiceId: string;
    internName: string;
    pet: string;
    subject: string;
    body: string;
    mailTo: string;
  },
) {
  const { newId } = await import("./crypto");
  const at = new Date().toISOString();
  const pet = input.pet || "Protokoll";
  const threadId = newId();
  await sql`
    insert into threads (id, practice_id, name, pet, preview, unread, intern, messages)
    values (
      ${threadId},
      ${input.practiceId},
      ${input.internName},
      ${pet},
      ${input.subject},
      ${1},
      ${true},
      ${JSON.stringify([{ from: "alma", text: input.body, at }])}::jsonb
    )
  `;
  await sql`
    insert into mails (id, practice_id, to_addr, subject, body, pet)
    values (
      ${newId()},
      ${input.practiceId},
      ${input.mailTo},
      ${input.subject},
      ${input.body},
      ${pet}
    )
  `;
  return { id: threadId };
}

function asMessages(value: unknown): { from: "alma" | "anrufer"; text: string; at: string }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map((row) => {
    const m = row as { from?: string; text?: string; at?: string };
    return {
      from: m.from === "anrufer" ? ("anrufer" as const) : ("alma" as const),
      text: String(m.text ?? "").slice(0, 4000),
      at: String(m.at ?? new Date().toISOString()),
    };
  });
}

/**
 * After a contact-only turn, append Handy/E-Mail to the last intern note for that pet
 * (15 minutes). Otherwise start a new unread protocol. Mail draft stays intern — to Frau Doktor.
 */
export async function appendInternContact(
  sql: Sql,
  input: {
    practiceId: string;
    internName: string;
    pet: string;
    owner?: string;
    subject: string;
    body: string;
    mailTo: string;
  },
) {
  const { newId } = await import("./crypto");
  const pets = internContactMatchPets(input.pet, input.owner).map((p) => p.toLowerCase());
  const pet = internProtocolPet(input.pet, input.owner);
  const at = new Date().toISOString();
  const recent = await sql<{ id: string; messages: unknown; pet: string }>`
    select id, messages, pet from threads
    where practice_id = ${input.practiceId}
      and intern = true
      and created_at > now() - interval '15 minutes'
      and lower(pet) in (${pets[0]}, ${pets[1] ?? pets[0]}, ${pets[2] ?? pets[0]})
    order by created_at desc
    limit 1
  `;
  if (recent[0]) {
    const messages = [...asMessages(recent[0].messages), { from: "alma" as const, text: input.body, at }];
    await sql`
      update threads
      set messages = ${JSON.stringify(messages)}::jsonb,
          unread = 1,
          preview = ${input.subject}
      where id = ${recent[0].id} and practice_id = ${input.practiceId}
    `;
    const mailPet = String(recent[0].pet || pet).toLowerCase();
    const mail = await sql<{ id: string; body: string }>`
      select id, body from mails
      where practice_id = ${input.practiceId}
        and lower(pet) = ${mailPet}
      order by at desc
      limit 1
    `;
    if (mail[0]) {
      const nextBody = `${mail[0].body}\n\n${input.body}`.slice(0, 4000);
      await sql`
        update mails
        set body = ${nextBody}, subject = ${input.subject}
        where id = ${mail[0].id} and practice_id = ${input.practiceId}
      `;
    } else if (input.mailTo) {
      await sql`
        insert into mails (id, practice_id, to_addr, subject, body, pet)
        values (
          ${newId()},
          ${input.practiceId},
          ${input.mailTo},
          ${input.subject},
          ${input.body},
          ${pet}
        )
      `;
    }
    return { ok: true as const, appended: true as const, id: recent[0].id };
  }
  const written = await writeInternProtocol(sql, { ...input, pet });
  return { ok: true as const, appended: false as const, id: written.id };
}
