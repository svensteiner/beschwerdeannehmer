export type StoredPracticeAppointment = {
  id: string;
  practice_id: string;
  start_at: string | Date;
  status: string;
  owner_name: string;
  pet: string;
};

export function isShortBookingConfirmation(text: string) {
  const value = String(text ?? "").trim();
  if (!value || value.includes("?")) return false;
  return /^(?:ja(?:[ ,]+(?:passt|genau|bitte|gerne))?|passt|genau|bitte|gerne|in ordnung)[.! ]*$/i.test(value);
}

export function validStoredAppointment(
  row: StoredPracticeAppointment | undefined,
  id: string,
  practiceId: string,
) {
  if (!row || row.id !== id || row.practice_id !== practiceId || row.status !== "gelegt") return false;
  const start = new Date(row.start_at);
  return !Number.isNaN(start.getTime());
}
