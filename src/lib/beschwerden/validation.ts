export const COMPLAINT_CATEGORIES = ["Ein-/Ausfahrt", "Parkticket oder Schranke", "Parkgebühr oder Abrechnung", "E-Laden", "Sauberkeit oder Sicherheit", "Sonstiges", "Parkplatz oder Schranke", "Abrechnung"] as const;
export type ComplaintPriority = "normal" | "dringend" | "sicherheit";
export type ComplaintInput = { location: string; category: string; description: string; name: string; email: string; occurredAt: string; contactPhone: string; priority: ComplaintPriority; consent: true };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const phonePattern = /^[+()\d\s./-]*$/u;
const limits = { location: 160, description: 5000, name: 120, email: 254 } as const;

export function validateComplaint(value: unknown): { ok: true; value: ComplaintInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Ungültige Eingabe." };
  const input = value as Record<string, unknown>;
  if (String(input.website ?? "").trim()) return { ok: false, error: "Ungültige Eingabe." };
  const result = { location: String(input.location ?? "").trim(), category: String(input.category ?? "").trim(), description: String(input.description ?? "").trim(), name: String(input.name ?? "").trim(), email: String(input.email ?? "").trim(), occurredAt: String(input.occurredAt ?? "").trim(), contactPhone: String(input.contactPhone ?? "").trim(), priority: String(input.priority ?? "normal") as ComplaintPriority };
  if (input.consent !== "yes" && input.consent !== true) return { ok: false, error: "Bitte der Bearbeitung zustimmen." };
  if (!result.location || result.location.length > limits.location) return { ok: false, error: "Bitte den Standort korrekt angeben." };
  if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(result.category)) return { ok: false, error: "Bitte eine gültige Kategorie auswählen." };
  if (result.description.length < 20 || result.description.length > limits.description) return { ok: false, error: "Die Schilderung muss zwischen 20 und 5.000 Zeichen enthalten." };
  if (!result.name || result.name.length > limits.name) return { ok: false, error: "Bitte den Namen korrekt angeben." };
  if (result.email.length > limits.email || !emailPattern.test(result.email)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
  if (result.occurredAt.length > 40 || result.contactPhone.length > 30 || !phonePattern.test(result.contactPhone)) return { ok: false, error: "Zeitpunkt oder Telefonnummer ist ungültig." };
  if (result.occurredAt && Number.isNaN(Date.parse(result.occurredAt))) return { ok: false, error: "Bitte einen gültigen Zeitpunkt angeben." };
  if (!["normal", "dringend", "sicherheit"].includes(result.priority)) return { ok: false, error: "Ungültige Dringlichkeitsstufe." };
  return { ok: true, value: { ...result, consent: true } };
}
