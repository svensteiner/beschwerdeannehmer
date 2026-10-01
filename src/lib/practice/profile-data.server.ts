import type { Patient } from "@/lib/alma/patients";
import type { Sql } from "@/lib/db";
import { PRACTICE_KB_LIMIT, hasPracticeKbNeedles, practiceKbNeedles } from "./practice-kb";
import { parseHoursJson, type PracticeProfile } from "./profile";
export async function fetchProfile(practiceId: string): Promise<PracticeProfile | null> {
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    owner_name: string;
    street: string;
    zip: string;
    city: string;
    bundesland: string;
    phone: string;
    whatsapp: string;
    email: string;
    pms: string;
    hours_json: string;
    nachtdienst_name: string;
    nachtdienst_phone: string;
    nachtdienst_note: string;
    notes: string;
    location_hint: string;
    slug: string;
    retention_days: number;
    vets: string;
    resources: string;
    behavior: string;
    consent_enabled: boolean;
    consent_note: string;
  }>`
    select id, name, owner_name, street, zip, city, bundesland, phone, whatsapp, email, pms,
           hours_json, nachtdienst_name, nachtdienst_phone, nachtdienst_note, notes, location_hint, slug, retention_days,
           vets, resources, behavior, consent_enabled, consent_note
    from practices where id = ${practiceId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const { keepNachtdienstNote, spokenNachtdienstDest } = await import("@/lib/alma/desk");
  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name,
    street: row.street,
    zip: row.zip,
    city: row.city,
    bundesland: row.bundesland,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    pms: row.pms,
    hours: parseHoursJson(row.hours_json),
    vets: row.vets || "",
    resources: row.resources || "",
    nachtdienstName: spokenNachtdienstDest(row.nachtdienst_name, row.nachtdienst_phone),
    nachtdienstPhone: row.nachtdienst_phone,
    nachtdienstNote: keepNachtdienstNote(row.nachtdienst_note),
    notes: row.notes,
    locationHint: row.location_hint || "",
    slug: row.slug || (await ensurePracticeSlug(row.id, row.name)),
    retentionDays: Number(row.retention_days) || 90,
    behavior: row.behavior || "",
    consentEnabled: Boolean(row.consent_enabled),
    consentNote: row.consent_note || "",
  };
}

export async function fetchProfileBySlug(slug: string): Promise<PracticeProfile | null> {
  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  if (!clean) return null;
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from practices where slug = ${clean} limit 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return fetchProfile(id);
}

export async function ensurePracticeSlug(practiceId: string, name: string): Promise<string> {
  const { getSql } = await import("@/lib/db.server");
  const { slugifyPractice } = await import("./slug");
  const sql = await getSql();
  const existing = await sql<{ slug: string }>`select slug from practices where id = ${practiceId} limit 1`;
  if (existing[0]?.slug) return existing[0].slug;
  const slug = slugifyPractice(name);
  for (let i = 0; i < 30; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`.slice(0, 48);
    const taken = await sql<{ id: string }>`
      select id from practices where slug = ${candidate} and id <> ${practiceId} limit 1
    `;
    if (!taken[0]) {
      await sql`update practices set slug = ${candidate} where id = ${practiceId}`;
      return candidate;
    }
  }
  const fallback = `${slug}-${practiceId.slice(0, 6)}`.slice(0, 48);
  await sql`update practices set slug = ${fallback} where id = ${practiceId}`;
  return fallback;
}

type PatientRow = {
  chip: string;
  name: string;
  species: string;
  breed: string;
  born: string;
  owner_name: string;
  phone: string;
  last_vaccine: string;
  rabies: string;
  registered: boolean;
  notes: string;
  last_visit: string | null;
  next_due: string | null;
  warnings: string | null;
  last_call_note: string | null;
};

function mapPatientRow(p: PatientRow): Patient {
  return {
    chip: p.chip,
    name: p.name,
    species: p.species,
    breed: p.breed,
    born: p.born,
    owner: p.owner_name,
    phone: p.phone,
    lastVaccine: p.last_vaccine || "unbekannt",
    rabies: p.rabies || "unbekannt",
    registered: Boolean(p.registered),
    notes: p.notes,
    lastVisit: p.last_visit || undefined,
    nextDue: p.next_due || undefined,
    warnings: p.warnings || undefined,
    lastCallNote: p.last_call_note || undefined,
  };
}

async function fetchMentionedPatients(sql: Sql, practiceId: string, spoken: string): Promise<Patient[]> {
  const n = practiceKbNeedles(spoken);
  if (!hasPracticeKbNeedles(n)) return [];
  const petExact = n.pet;
  const petLike = n.pet ? `${n.pet}%` : "";
  const ownerLike = n.owner ? `%${n.owner}%` : "";
  const chip = n.chip;
  const chipLike = n.chip ? `%${n.chip.slice(-4)}` : "";
  const phoneLike = n.phone ? `%${n.phone}%` : "";
  const rows = await sql<PatientRow>`
    select chip, name, species, breed, born, owner_name, phone, last_vaccine, rabies,
           registered, notes, last_visit, next_due, warnings, last_call_note
    from patients
    where practice_id = ${practiceId}
      and (
        (${petExact} <> '' and lower(name) = ${petExact})
        or (${petLike} <> '' and lower(name) like ${petLike})
        or (${ownerLike} <> '' and lower(owner_name) like ${ownerLike})
        or (${chip} <> '' and chip = ${chip})
        or (${chipLike} <> '' and chip like ${chipLike})
        or (${phoneLike} <> '' and replace(replace(phone, ' ', ''), '-', '') like ${phoneLike})
      )
    order by name asc
    limit ${PRACTICE_KB_LIMIT}
  `;
  return rows.map(mapPatientRow);
}

/** Named pet from the full Kartei — never a recent dump of the whole Ordination. */
export async function loadPracticePatients(practiceId: string, spoken = ""): Promise<Patient[]> {
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  return fetchMentionedPatients(sql, practiceId, spoken);
}
