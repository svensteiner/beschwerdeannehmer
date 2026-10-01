import { patientPhoneDigits, patientSearchNeedle } from "./patient-query.ts";

export function protocolSearchNeedle(raw: string) {
  return patientSearchNeedle(raw);
}

export function protocolMessagesText(
  messages: { text?: string }[] | string | null | undefined,
) {
  if (typeof messages === "string") return messages.toLowerCase();
  if (!Array.isArray(messages)) return "";
  return messages
    .map((line) => String(line?.text ?? ""))
    .join(" ")
    .toLowerCase();
}

/** Same matching rules as searchProtocol SQL for WhatsApp threads. */
export function threadMatchesNeedle(
  needle: string,
  row: {
    name: string;
    pet: string;
    preview: string;
    owner_phone?: string;
    owner_email?: string;
    messages?: { text?: string }[] | string;
  },
) {
  if (!needle) return true;
  const blob = [row.name, row.pet, row.preview, row.owner_email ?? "", protocolMessagesText(row.messages)]
    .join(" ")
    .toLowerCase();
  if (blob.includes(needle)) return true;
  const digits = patientPhoneDigits(needle);
  const phone = patientPhoneDigits(row.owner_phone ?? "");
  return digits.length >= 3 && phone.includes(digits);
}

/** Same matching rules as searchProtocol SQL for mail drafts. */
export function mailMatchesNeedle(
  needle: string,
  row: { subject: string; body: string; pet: string; to_addr?: string; owner_email?: string },
) {
  if (!needle) return true;
  const blob = [row.subject, row.body, row.pet, row.to_addr ?? "", row.owner_email ?? ""].join(" ").toLowerCase();
  return blob.includes(needle);
}
