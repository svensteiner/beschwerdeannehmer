import type { Sql } from "@/lib/db";
import { akteContactForCall, callSpokenBlob, resolveOwnerEmail, resolveOwnerPhone } from "./call-contact.ts";

export type ThreadRow = {
  id: string;
  name: string;
  pet: string;
  preview: string;
  unread: number;
  intern: boolean;
  messages: unknown;
  created_at: string | Date;
  owner_phone: string;
  owner_email?: string;
};

export type DeskThread = {
  id: string;
  name: string;
  pet: string;
  preview: string;
  unread: number;
  intern: boolean;
  owner_phone: string;
  owner_email: string;
  created_at: string;
  messages: { from: "alma" | "anrufer"; text: string; at: string }[];
};

export type MailRow = {
  id: string;
  at: string | Date;
  to_addr: string;
  subject: string;
  body: string;
  pet: string;
};

export type DeskMail = {
  id: string;
  at: string;
  to_addr: string;
  subject: string;
  body: string;
  pet: string;
};

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asMessages(value: unknown): DeskThread["messages"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((row) => {
    const m = row as { from?: string; text?: string; at?: string };
    return {
      from: m.from === "anrufer" ? ("anrufer" as const) : ("alma" as const),
      text: String(m.text ?? "").slice(0, 4000),
      at: String(m.at ?? new Date().toISOString()),
    };
  });
}

export function mapThreadRow(t: ThreadRow): DeskThread {
  const messages = asMessages(t.messages);
  const blob = callSpokenBlob({
    concern: t.preview,
    caller: t.name,
    transcript: messages,
  });
  return {
    id: t.id,
    name: t.name,
    pet: t.pet,
    preview: t.preview,
    unread: Number(t.unread) || 0,
    intern: Boolean(t.intern),
    owner_phone: resolveOwnerPhone(akteContactForCall(t.pet, t.owner_phone), blob),
    owner_email: resolveOwnerEmail(akteContactForCall(t.pet, t.owner_email), blob),
    created_at: asIso(t.created_at),
    messages,
  };
}

export function mapMailRow(m: MailRow): DeskMail {
  return {
    id: m.id,
    at: asIso(m.at),
    to_addr: m.to_addr || "",
    subject: m.subject || "",
    body: m.body == null ? "" : String(m.body),
    pet: m.pet || "",
  };
}

/** Newest threads for the Tafel, or one id, or a search over the whole tenant log. */
export async function fetchPracticeThreads(
  sql: Sql,
  practiceId: string,
  opts: { id?: string; like?: string; phoneLike?: string; limit: number },
): Promise<ThreadRow[]> {
  const limit = Math.max(1, Math.min(80, Math.floor(opts.limit) || 40));
  if (opts.id) {
    return sql<ThreadRow>`
      select t.id, t.name, t.pet, t.preview, t.unread, t.intern, t.messages, t.created_at,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
          limit 1
        ), '') as owner_email
      from threads t
      where t.practice_id = ${practiceId} and t.id = ${opts.id}
      limit 1
    `;
  }
  const like = opts.like ?? "";
  const phoneLike = opts.phoneLike ?? "";
  if (like) {
    return sql<ThreadRow>`
      select t.id, t.name, t.pet, t.preview, t.unread, t.intern, t.messages, t.created_at,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
          limit 1
        ), '') as owner_email
      from threads t
      where t.practice_id = ${practiceId}
        and (
          lower(t.name) like ${like}
          or lower(t.pet) like ${like}
          or lower(t.preview) like ${like}
          or lower(cast(t.messages as text)) like ${like}
          or exists (
            select 1 from patients p
            where p.practice_id = t.practice_id
              and lower(p.name) = lower(t.pet)
              and (
                lower(p.owner_name) like ${like}
                or lower(p.email) like ${like}
                or (${phoneLike} <> '' and replace(replace(p.phone, ' ', ''), '-', '') like ${phoneLike})
              )
          )
        )
      order by t.created_at desc
      limit ${limit}
    `;
  }
  return sql<ThreadRow>`
    select t.id, t.name, t.pet, t.preview, t.unread, t.intern, t.messages, t.created_at,
      coalesce((
        select nullif(p.phone, '') from patients p
        where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
        limit 1
      ), '') as owner_phone,
      coalesce((
        select nullif(p.email, '') from patients p
        where p.practice_id = t.practice_id and lower(p.name) = lower(t.pet)
        limit 1
      ), '') as owner_email
    from threads t
    where t.practice_id = ${practiceId}
    order by case when t.intern and t.unread > 0 then 0 else 1 end, t.created_at desc
    limit ${limit}
  `;
}

/** Newest mails for the Tafel, or one id, or a search over the whole tenant log. */
export async function fetchPracticeMails(
  sql: Sql,
  practiceId: string,
  opts: { id?: string; like?: string; limit: number },
): Promise<MailRow[]> {
  const limit = Math.max(1, Math.min(80, Math.floor(opts.limit) || 40));
  if (opts.id) {
    return sql<MailRow>`
      select id, at, to_addr, subject, body, pet from mails
      where practice_id = ${practiceId} and id = ${opts.id}
      limit 1
    `;
  }
  const like = opts.like ?? "";
  if (like) {
    return sql<MailRow>`
      select id, at, to_addr, subject, body, pet from mails
      where practice_id = ${practiceId}
        and (
          lower(subject) like ${like}
          or lower(body) like ${like}
          or lower(pet) like ${like}
          or lower(to_addr) like ${like}
          or exists (
            select 1 from patients p
            where p.practice_id = ${practiceId}
              and lower(p.name) = lower(pet)
              and lower(p.email) like ${like}
          )
        )
      order by at desc
      limit ${limit}
    `;
  }
  return sql<MailRow>`
    select id, at, to_addr, subject, body, pet from mails
    where practice_id = ${practiceId}
    order by at desc
    limit ${limit}
  `;
}
