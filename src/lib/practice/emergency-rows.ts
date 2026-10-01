import type { Sql } from "@/lib/db";
import {
  akteCallerForCall,
  akteContactForCall,
  callSpokenBlob,
  resolveOwnerEmail,
  resolveOwnerPhone,
} from "./call-contact.ts";

export type EmergencyRow = {
  id: string;
  at: string | Date;
  owner_name: string;
  pet: string;
  species: string;
  summary: string;
  urgency: string;
  routed_to: string;
  status: string;
  owner_phone: string;
  owner_email?: string;
  spoken_owner?: string;
};

export type DeskEmergency = {
  id: string;
  at: string;
  owner_name: string;
  pet: string;
  species: string;
  summary: string;
  urgency: string;
  routed_to: string;
  status: string;
  owner_phone: string;
  owner_email: string;
};

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function mapEmergencyRow(e: EmergencyRow): DeskEmergency {
  const owner_name = akteCallerForCall(e.pet, e.owner_name, e.spoken_owner);
  const blob = callSpokenBlob({
    summary: e.summary,
    caller: owner_name,
    concern: e.pet,
  });
  return {
    id: e.id,
    at: asIso(e.at),
    owner_name,
    pet: e.pet,
    species: e.species,
    summary: e.summary,
    urgency: e.urgency,
    routed_to: e.routed_to,
    status: e.status,
    owner_phone: resolveOwnerPhone(akteContactForCall(e.pet, e.owner_phone), blob),
    owner_email: resolveOwnerEmail(akteContactForCall(e.pet, e.owner_email), blob),
  };
}

/** Newest emergencies for the Tafel, or one id, or a search over the whole tenant log. */
export async function fetchPracticeEmergencies(
  sql: Sql,
  practiceId: string,
  opts: { id?: string; like?: string; phoneLike?: string; limit: number },
): Promise<EmergencyRow[]> {
  const limit = Math.max(1, Math.min(80, Math.floor(opts.limit) || 40));
  if (opts.id) {
    return sql<EmergencyRow>`
      select e.id, e.at,
        coalesce(
          nullif((
            select p.owner_name from patients p
            where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
            limit 1
          ), ''),
          e.owner_name
        ) as owner_name,
        e.owner_name as spoken_owner,
        e.pet, e.species, e.summary, e.urgency, e.routed_to, e.status,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
          limit 1
        ), '') as owner_email
      from emergencies e
      where e.practice_id = ${practiceId} and e.id = ${opts.id}
      limit 1
    `;
  }
  const like = opts.like ?? "";
  const phoneLike = opts.phoneLike ?? "";
  if (like) {
    return sql<EmergencyRow>`
      select e.id, e.at,
        coalesce(
          nullif((
            select p.owner_name from patients p
            where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
            limit 1
          ), ''),
          e.owner_name
        ) as owner_name,
        e.owner_name as spoken_owner,
        e.pet, e.species, e.summary, e.urgency, e.routed_to, e.status,
        coalesce((
          select nullif(p.phone, '') from patients p
          where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
          limit 1
        ), '') as owner_phone,
        coalesce((
          select nullif(p.email, '') from patients p
          where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
          limit 1
        ), '') as owner_email
      from emergencies e
      where e.practice_id = ${practiceId}
        and (
          lower(e.owner_name) like ${like}
          or lower(e.pet) like ${like}
          or lower(e.summary) like ${like}
          or lower(e.routed_to) like ${like}
          or lower(e.species) like ${like}
          or exists (
            select 1 from patients p
            where p.practice_id = e.practice_id
              and lower(p.name) = lower(e.pet)
              and (
                lower(p.owner_name) like ${like}
                or lower(p.email) like ${like}
                or (${phoneLike} <> '' and replace(replace(p.phone, ' ', ''), '-', '') like ${phoneLike})
              )
          )
        )
      order by e.at desc
      limit ${limit}
    `;
  }
  return sql<EmergencyRow>`
    select e.id, e.at,
      coalesce(
        nullif((
          select p.owner_name from patients p
          where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
            and p.owner_name <> '' and p.owner_name <> 'Klientel'
          limit 1
        ), ''),
        e.owner_name
      ) as owner_name,
      e.owner_name as spoken_owner,
      e.pet, e.species, e.summary, e.urgency, e.routed_to, e.status,
      coalesce((
        select nullif(p.phone, '') from patients p
        where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
        limit 1
      ), '') as owner_phone,
      coalesce((
        select nullif(p.email, '') from patients p
        where p.practice_id = e.practice_id and lower(p.name) = lower(e.pet)
        limit 1
      ), '') as owner_email
    from emergencies e
    where e.practice_id = ${practiceId}
    order by e.at desc
    limit ${limit}
  `;
}
