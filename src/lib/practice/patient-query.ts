import { isPlaceholderPet } from "../alma/protocol.ts";
import { sanitizeHalterinEmail, toWaMeNumber } from "../alma/phone.ts";

/** Safe LIKE needle for the Kartei search. Strips wildcards. */
export function patientSearchNeedle(raw: string) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[%_\\]/g, "")
    .slice(0, 40);
}

export function patientPhoneDigits(raw: string) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 16);
}

/** Halterin key: Frau/Herr fallen, Klientel zählt nicht. */
export function patientOwnerKey(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(frau|herr|fam\.?|familie)\s+/, "")
    .replace(/\s+/g, " ");
}

export type PatientIdentity = {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  email?: string;
  chip?: string;
};

export type PatientMatchNeedle = {
  name: string;
  owner?: string;
  phone?: string;
  chip?: string;
};

export function ownersAlign(rowOwner: string, needleOwner: string) {
  const a = patientOwnerKey(rowOwner);
  const b = patientOwnerKey(needleOwner);
  if (!a || !b || a === "klientel" || b === "klientel") return false;
  if (a === b) return true;
  const partsA = a.split(" ").filter(Boolean);
  const partsB = b.split(" ").filter(Boolean);
  // Zwei verschiedene Vornamen sind zwei verschiedene Personen, auch bei
  // gleichem Nachnamen: „Anna Berger“ darf nicht „Maria Berger“ sein. Der
  // Nachname allein trägt nur, wenn eine Seite NUR den Nachnamen nennt.
  if (partsA.length >= 2 && partsB.length >= 2 && partsA[0] !== partsB[0]) return false;
  const lastA = partsA[partsA.length - 1] ?? "";
  const lastB = partsB[partsB.length - 1] ?? "";
  return lastA.length >= 4 && lastA === lastB;
}

/**
 * 15-minute spoken contact may fill Handy/E-Mail on the last Akte when the Halterin
 * is missing or the same. A named different Halterin must not overwrite that Akte.
 */
export function canAttachSpokenPatient(latestOwner: string, incomingOwner: string) {
  const latest = patientOwnerKey(latestOwner);
  const incoming = patientOwnerKey(incomingOwner);
  if (!latest || latest === "klientel" || !incoming || incoming === "klientel") return true;
  return ownersAlign(latestOwner, incomingOwner);
}

/** Later Handy/E-Mail may join the last Akte — never a leftover Nummer/Patient row. */
export function canAttachSpokenRow(
  latest: { name?: string | null; owner_name?: string | null },
  incomingOwner: string,
) {
  if (isPlaceholderPet(latest.name)) return false;
  return canAttachSpokenPatient(String(latest.owner_name ?? ""), incomingOwner);
}

/** Nameless Slot Handy may join that Halterin — never a leftover other owner. */
export function canAttachConfirmOwnerRow(
  latest: { owner_name?: string | null },
  incomingOwner: string,
) {
  const incoming = String(incomingOwner ?? "").trim();
  const latestOwner = String(latest.owner_name ?? "").trim();
  if (!incoming || incoming === "Klientel" || !latestOwner || latestOwner === "Klientel") return false;
  return ownersAlign(latestOwner, incoming);
}

export function pickConfirmOwnerRow<T extends { owner_name?: string | null }>(
  rows: T[],
  incomingOwner: string,
): T | null {
  // Bei MEHREREN passenden Halterinnen ist die Zuordnung nicht eindeutig.
  // Früher gewann still der erste Treffer; jetzt bleibt sie offen, damit
  // niemandem die falsche Akte zugeordnet wird.
  const hits = rows.filter((row) => canAttachConfirmOwnerRow(row, incomingOwner));
  return hits.length === 1 ? hits[0] : null;
}

function phonesAlign(rowPhone: string, needlePhone: string) {
  const a = patientPhoneDigits(rowPhone);
  const b = patientPhoneDigits(needlePhone);
  if (a.length < 6 || b.length < 6) return false;
  return a === b || a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

export type HolderAkteRow = {
  id: string;
  name: string;
  owner_name?: string;
  phone?: string;
  email?: string;
};

/** Unique Kartei row for a nameless Rückruf: Handy first, else Halterin. Several pets stay several. */
export function pickHolderAkte(
  patients: HolderAkteRow[],
  holder?: { owner?: string; phone?: string },
): HolderAkteRow | null {
  if (!patients.length) return null;
  const phone = String(holder?.phone ?? "");
  if (patientPhoneDigits(phone).length >= 6) {
    const hits = patients.filter((row) => phonesAlign(row.phone ?? "", phone));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  const owner = String(holder?.owner ?? "");
  if (patientOwnerKey(owner) && patientOwnerKey(owner) !== "klientel") {
    const hits = patients.filter((row) => ownersAlign(row.owner_name ?? "", owner));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/**
 * Walk-in and live line: never smash two Bellas into one row.
 * One name with the same Halterin (or none) → that row. A different Halterin → null (insert).
 * Several → Chip, then Handy, then Halterin. Else null.
 */
export function pickPatientMatch(
  rows: PatientIdentity[],
  needle: PatientMatchNeedle,
): PatientIdentity | null {
  const name = String(needle.name ?? "").trim().toLowerCase();
  if (!name || name === "patient") return null;
  const named = rows.filter((row) => row.name.toLowerCase() === name);
  if (named.length === 0) return null;
  if (named.length === 1) {
    const row = named[0];
    const chip = sanitizePatientChip(needle.chip);
    const rowChip = sanitizePatientChip(row.chip);
    if (chip && rowChip && chip !== rowChip) return null;
    const ownerNeedle = patientOwnerKey(needle.owner);
    const rowOwner = patientOwnerKey(row.owner_name);
    const ownerReal = Boolean(ownerNeedle && ownerNeedle !== "klientel");
    const rowReal = Boolean(rowOwner && rowOwner !== "klientel");
    if (ownerReal && rowReal && !ownersAlign(row.owner_name, needle.owner ?? "")) return null;
    if (
      !ownerReal &&
      !rowReal &&
      patientPhoneDigits(needle.phone ?? "").length >= 6 &&
      patientPhoneDigits(row.phone).length >= 6 &&
      !phonesAlign(row.phone, needle.phone ?? "")
    ) {
      return null;
    }
    return row;
  }

  const chip = sanitizePatientChip(needle.chip);
  if (chip) {
    const hits = named.filter((row) => sanitizePatientChip(row.chip) === chip);
    if (hits.length === 1) return hits[0];
  }
  if (patientPhoneDigits(needle.phone ?? "").length >= 6) {
    const hits = named.filter((row) => phonesAlign(row.phone, needle.phone ?? ""));
    if (hits.length === 1) return hits[0];
  }
  const owner = needle.owner ?? "";
  if (patientOwnerKey(owner) && patientOwnerKey(owner) !== "klientel") {
    const hits = named.filter((row) => ownersAlign(row.owner_name, owner));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/** Same matching rules as searchPatients SQL (name, Halterin, Handy, Chip, E-Mail). */
export function patientMatchesNeedle(
  needle: string,
  row: { name: string; owner_name: string; phone: string; chip: string; email?: string },
) {
  if (!needle) return true;
  const name = row.name.toLowerCase();
  const owner = row.owner_name.toLowerCase();
  const chip = row.chip.toLowerCase();
  const email = String(row.email ?? "").toLowerCase();
  const phone = patientPhoneDigits(row.phone);
  const digits = patientPhoneDigits(needle);
  if (name.includes(needle) || owner.includes(needle) || chip.includes(needle) || email.includes(needle)) return true;
  return digits.length >= 3 && phone.includes(digits);
}

/** ISO 11784/11785 transponder — digits only, never invent a number. */
export function sanitizePatientChip(raw: unknown) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 15);
}

export function sanitizePatientSpecies(raw: unknown) {
  return String(raw ?? "").trim().slice(0, 40);
}

export function sanitizePatientNotes(raw: unknown) {
  return String(raw ?? "").trim().slice(0, 400);
}

export function patientContactFieldIds(id: string) {
  return {
    owner: `akte-owner-${id}`,
    phone: `akte-phone-${id}`,
    email: `akte-email-${id}`,
    species: `akte-species-${id}`,
    chip: `akte-chip-${id}`,
    notes: `akte-notes-${id}`,
    save: `akte-save-${id}`,
  };
}

/** Same IDs as Akte PatientCard. Reads the fields, not stale React state. */
export function patientContactFromFields(
  get: (id: string) => string,
  ids: {
    owner: string;
    phone: string;
    email?: string;
    species?: string;
    chip?: string;
    notes?: string;
  },
) {
  return {
    owner: get(ids.owner).trim().slice(0, 80),
    phone: get(ids.phone).trim().slice(0, 24),
    email: sanitizeHalterinEmail(ids.email ? get(ids.email) : ""),
    species: sanitizePatientSpecies(ids.species ? get(ids.species) : ""),
    chip: sanitizePatientChip(ids.chip ? get(ids.chip) : ""),
    notes: sanitizePatientNotes(ids.notes ? get(ids.notes) : ""),
  };
}

export type AkteSearch = {
  p?: string;
  q?: string;
  owner?: string;
  phone?: string;
  email?: string;
};

function holderSearchBits(holder?: { owner?: string; phone?: string; email?: string }): AkteSearch {
  const owner = String(holder?.owner ?? "").trim().slice(0, 80);
  const phone = String(holder?.phone ?? "").trim().slice(0, 32);
  const email = sanitizeHalterinEmail(holder?.email);
  const skipOwner = !owner || /^klientel$/i.test(owner);
  return {
    ...(skipOwner ? {} : { owner }),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  };
}

/** Deep-link to the Kartei card: id when the Tafel already has the pet, else search. Nameless → existing Halterin Akte or new form. */
export function akteSearchParams(
  pet: string,
  patients: HolderAkteRow[] = [],
  holder?: { owner?: string; phone?: string; email?: string },
): AkteSearch {
  const name = String(pet ?? "").trim();
  const holderBits = holderSearchBits(holder);
  if (name && !isPlaceholderPet(name)) {
    const hits = patients.filter((row) => row.name.toLowerCase() === name.toLowerCase());
    if (hits.length === 1) return { p: hits[0].id };
    return { q: name.slice(0, 40), ...holderBits };
  }
  const found = pickHolderAkte(patients, holder);
  if (found) return { p: found.id };
  const who = String(holderBits.owner ?? "")
    .replace(/^Klientel\s+/i, "")
    .trim()
    .slice(0, 40);
  if (who) return { q: who, ...holderBits };
  return holderBits;
}

/** Kassa label for the Akte deep-link. Empty when Telefon and E-Mail are both already there. */
export function akteKontaktLabel(phone?: string | null, email?: string | null) {
  const hasPhone = Boolean(toWaMeNumber(String(phone ?? "")));
  const hasEmail = Boolean(sanitizeHalterinEmail(email));
  if (hasPhone && hasEmail) return "";
  if (!hasPhone && !hasEmail) return "Kontakt nachtragen";
  if (!hasPhone) return "Telefon nachtragen";
  return "E-Mail nachtragen";
}

/** Nameless Rückruf: anlegen until a unique Akte exists, then open that card. Anzeige: Akte, never anlegen/nachtragen. */
export function akteDeskLabel(
  pet: string,
  phone?: string | null,
  email?: string | null,
  linkedId?: string | null,
  anzeige?: boolean,
) {
  let label: string;
  if (linkedId && isPlaceholderPet(pet)) {
    label = akteKontaktLabel(phone, email) || "Akte";
  } else if (isPlaceholderPet(pet)) {
    label = "Akte anlegen";
  } else {
    label = akteKontaktLabel(phone, email) ?? "";
  }
  if (anzeige && label) return "Akte";
  return label;
}

/** Kartei-only create: real Tier + Halterin, no Walk-in slot. */
export function parseNewAkte(input: { pet?: string; owner?: string; phone?: string; email?: string }) {
  const pet = String(input?.pet ?? "").trim().slice(0, 40);
  const owner = String(input?.owner ?? "").trim().slice(0, 80);
  const phone = String(input?.phone ?? "").replace(/\s/g, "").slice(0, 24);
  const email = sanitizeHalterinEmail(input?.email);
  if (pet.length < 2 || owner.length < 2) return null;
  if (isPlaceholderPet(pet)) return null;
  return { pet, owner, phone, email };
}

/** True when Akte save changed Handy or E-Mail (name-only edits stay quiet). */
export function contactChanged(
  prev: { phone?: string | null; email?: string | null },
  next: { phone?: string | null; email?: string | null },
) {
  const prevPhone = String(prev.phone ?? "").replace(/\s/g, "");
  const nextPhone = String(next.phone ?? "").replace(/\s/g, "");
  const prevMail = sanitizeHalterinEmail(prev.email);
  const nextMail = sanitizeHalterinEmail(next.email);
  return (Boolean(nextPhone) && nextPhone !== prevPhone) || (Boolean(nextMail) && nextMail !== prevMail);
}
