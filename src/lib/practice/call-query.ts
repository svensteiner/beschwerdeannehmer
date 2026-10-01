import { patientPhoneDigits, patientSearchNeedle } from "./patient-query.ts";

export function callSearchNeedle(raw: string) {
  return patientSearchNeedle(raw);
}

export function callTranscriptText(
  transcript: { text?: string }[] | string | null | undefined,
) {
  if (typeof transcript === "string") return transcript.toLowerCase();
  if (!Array.isArray(transcript)) return "";
  return transcript
    .map((line) => String(line?.text ?? ""))
    .join(" ")
    .toLowerCase();
}

/** Same matching rules as searchCalls SQL (Halterin, Tier, Anliegen, Aktion, Handy, E-Mail, Transkript). */
export function callMatchesNeedle(
  needle: string,
  row: {
    caller: string;
    pet: string;
    concern: string;
    action: string;
    owner_phone?: string;
    owner_email?: string;
    transcript?: { text?: string }[] | string;
  },
) {
  if (!needle) return true;
  const blob = [
    row.caller,
    row.pet,
    row.concern,
    row.action,
    row.owner_email ?? "",
    callTranscriptText(row.transcript),
  ]
    .join(" ")
    .toLowerCase();
  if (blob.includes(needle)) return true;
  const digits = patientPhoneDigits(needle);
  const phone = patientPhoneDigits(row.owner_phone ?? "");
  return digits.length >= 3 && phone.includes(digits);
}
