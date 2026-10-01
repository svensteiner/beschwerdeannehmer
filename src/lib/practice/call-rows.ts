import type { Sql } from "@/lib/db";
import { displayCallAction } from "../alma/phone.ts";
import { akteCallerForCall, akteContactForCall, resolveOwnerEmail, resolveOwnerPhone, callSpokenBlob } from "./call-contact.ts";

export type CallRow = {
  id: string;
  at: string | Date;
  channel: string;
  caller: string;
  pet: string;
  species: string;
  concern: string;
  status: string;
  duration_sec: number;
  transcript: unknown;
  action: string;
  summary?: string;
  owner_phone: string;
  owner_email?: string;
  spoken_caller?: string;
  consent_announced_at?: string | Date | null;
};

export type DeskCall = {
  id: string;
  at: string;
  channel: string;
  caller: string;
  pet: string;
  species: string;
  concern: string;
  status: string;
  durationSec: number;
  action: string;
  transcript: { from: "alma" | "anrufer"; text: string; at: string }[];
  summary: string;
  owner_phone: string;
  owner_email: string;
  consentAnnouncedAt: string;
};

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asMessages(value: unknown): DeskCall["transcript"] {
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

export function mapCallRow(c: CallRow): DeskCall {
  const transcript = asMessages(c.transcript);
  const caller = akteCallerForCall(c.pet, c.caller, c.spoken_caller);
  const blob = callSpokenBlob({
    concern: c.concern,
    caller,
    transcript,
  });
  return {
    id: c.id,
    at: asIso(c.at),
    channel: c.channel,
    caller,
    pet: c.pet,
    species: c.species,
    concern: c.concern,
    status: c.status,
    durationSec: Number(c.duration_sec) || 0,
    action: displayCallAction(c.action),
    transcript,
    summary: String(c.summary ?? ""),
    owner_phone: resolveOwnerPhone(akteContactForCall(c.pet, c.owner_phone), blob),
    owner_email: resolveOwnerEmail(akteContactForCall(c.pet, c.owner_email), blob),
    consentAnnouncedAt: c.consent_announced_at ? asIso(c.consent_announced_at) : "",
  };
}

/** Newest calls for the Tafel, or one id, or a search over the whole tenant log. */
export async function fetchPracticeCalls(
  sql: Sql,
  practiceId: string,
  opts: { id?: string; like?: string; phoneLike?: string; limit: number },
): Promise<CallRow[]> {
  const limit = Math.max(1, Math.min(80, Math.floor(opts.limit) || 40));
  if (opts.id) {
    return sql<CallRow>`
      select c.id, c.at, c.channel,
        coalesce(
          nullif((
            select p.owner_name from patients p
            where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
            limit 1
          ), ''),
          c.caller
        ) as caller,
        c.caller as spoken_caller,
        c.pet, c.species, c.concern, c.status, c.duration_sec, c.transcript, c.action, c.summary, c.consent_announced_at,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
          limit 1
        ), '') as owner_email
      from calls c
      where c.practice_id = ${practiceId} and c.id = ${opts.id}
      limit 1
    `;
  }
  const like = opts.like ?? "";
  const phoneLike = opts.phoneLike ?? "";
  if (like) {
    return sql<CallRow>`
      select c.id, c.at, c.channel,
        coalesce(
          nullif((
            select p.owner_name from patients p
            where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
            limit 1
          ), ''),
          c.caller
        ) as caller,
        c.caller as spoken_caller,
        c.pet, c.species, c.concern, c.status, c.duration_sec, c.transcript, c.action, c.summary, c.consent_announced_at,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
          limit 1
        ), '') as owner_email
      from calls c
      where c.practice_id = ${practiceId}
        and (
          lower(c.caller) like ${like}
          or lower(c.pet) like ${like}
          or lower(c.concern) like ${like}
          or lower(c.action) like ${like}
          or lower(cast(c.transcript as text)) like ${like}
          or exists (
            select 1 from patients p
            where p.practice_id = c.practice_id
              and lower(p.name) = lower(c.pet)
              and (
                lower(p.owner_name) like ${like}
                or lower(p.email) like ${like}
                or (${phoneLike} <> '' and replace(replace(p.phone, ' ', ''), '-', '') like ${phoneLike})
              )
          )
        )
      order by c.at desc
      limit ${limit}
    `;
  }
  return sql<CallRow>`
    select c.id, c.at, c.channel,
      coalesce(
        nullif((
          select p.owner_name from patients p
          where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
            and p.owner_name <> '' and p.owner_name <> 'Klientel'
          limit 1
        ), ''),
        c.caller
      ) as caller,
      c.caller as spoken_caller,
      c.pet, c.species, c.concern, c.status, c.duration_sec, c.transcript, c.action, c.summary, c.consent_announced_at,
      coalesce((
        select nullif(p.phone, '') from patients p
        where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
        limit 1
      ), '') as owner_phone,
      coalesce((
        select nullif(p.email, '') from patients p
        where p.practice_id = c.practice_id and lower(p.name) = lower(c.pet)
        limit 1
      ), '') as owner_email
    from calls c
    where c.practice_id = ${practiceId}
    order by c.at desc
    limit ${limit}
  `;
}
