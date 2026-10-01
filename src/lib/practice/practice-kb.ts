import { guessOwner, guessPet } from "../alma/actions.ts";
import { patientPhoneDigits } from "./patient-query.ts";

/** How many matching Akten Silvia may send toward a model (named hits only). */
export const PRACTICE_KB_LIMIT = 16;
/** Recent fallback when the caller has not named a pet yet. */
export const PRACTICE_KB_RECENT = 12;

export type PracticeKbNeedles = {
  pet: string;
  owner: string;
  chip: string;
  phone: string;
};

/** Pull pet / Halterin / Chip / Handy from the spoken turns for a Kartei lookup. */
export function practiceKbNeedles(spoken: string): PracticeKbNeedles {
  const text = String(spoken ?? "");
  const petRaw = guessPet(text, { includeDemo: false });
  const ownerRaw = guessOwner(text, { includeDemo: false }).replace(/^Klientel\s+/i, "").trim();
  const chip15 = text.match(/\b(\d{15})\b/)?.[1] ?? "";
  const chipHint =
    !chip15 && /chip/i.test(text)
      ? text.replace(/\D/g, "").slice(-4)
      : "";
  const digits = patientPhoneDigits(text);
  return {
    pet: petRaw !== "Patient" ? petRaw.toLowerCase() : "",
    owner: ownerRaw && ownerRaw.toLowerCase() !== "klientel" ? ownerRaw.toLowerCase() : "",
    chip: chip15 || (chipHint.length >= 4 ? chipHint : ""),
    phone: !chip15 && digits.length >= 6 ? digits : "",
  };
}

export function hasPracticeKbNeedles(n: PracticeKbNeedles) {
  return Boolean(n.pet || n.owner || n.chip || n.phone);
}

/** Same matching idea as the SQL in loadPracticePatients (no LIKE wildcards in needles). */
export function patientMatchesCallNeedles(
  row: { name: string; owner: string; chip: string; phone: string },
  n: PracticeKbNeedles,
) {
  const name = row.name.toLowerCase();
  const owner = row.owner.toLowerCase();
  if (n.pet && (name === n.pet || name.startsWith(n.pet))) return true;
  if (n.owner && owner.includes(n.owner)) return true;
  if (n.chip) {
    const chip = row.chip.replace(/\D/g, "");
    if (chip === n.chip || chip.endsWith(n.chip.slice(-4))) return true;
  }
  if (n.phone) {
    const phone = patientPhoneDigits(row.phone);
    if (phone.includes(n.phone)) return true;
  }
  return false;
}

export function pickPracticeKb<T extends { name: string; chip: string }>(
  mentioned: T[],
  recent: T[],
  limit = PRACTICE_KB_LIMIT,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of [...mentioned, ...recent]) {
    const key = `${row.chip}|${row.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** Named / Chip / Handy hits only — the model never gets the rest of the Kartei. */
export function selectPracticeKb<T extends { name: string; owner: string; chip: string; phone: string }>(
  rows: T[],
  spoken: string,
  limit = PRACTICE_KB_LIMIT,
): T[] {
  const n = practiceKbNeedles(spoken);
  if (!hasPracticeKbNeedles(n)) return [];
  const mentioned = rows.filter((row) => patientMatchesCallNeedles(row, n));
  return pickPracticeKb(mentioned, [], limit);
}
