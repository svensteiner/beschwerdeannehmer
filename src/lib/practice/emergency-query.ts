import { patientPhoneDigits, patientSearchNeedle } from "./patient-query.ts";

export function emergencySearchNeedle(raw: string) {
  return patientSearchNeedle(raw);
}

/** Same matching rules as searchEmergencies SQL (Halterin, Tier, Summary, Nachtdienst, Handy, E-Mail). */
export function emergencyMatchesNeedle(
  needle: string,
  row: {
    owner_name: string;
    pet: string;
    summary: string;
    routed_to?: string;
    species?: string;
    owner_phone?: string;
    owner_email?: string;
  },
) {
  if (!needle) return true;
  const blob = [row.owner_name, row.pet, row.summary, row.routed_to ?? "", row.species ?? "", row.owner_email ?? ""]
    .join(" ")
    .toLowerCase();
  if (blob.includes(needle)) return true;
  const digits = patientPhoneDigits(needle);
  const phone = patientPhoneDigits(row.owner_phone ?? "");
  return digits.length >= 3 && phone.includes(digits);
}
