export const COMPLAINT_CATEGORIES = ["Ein-/Ausfahrt", "Parkplatz oder Schranke", "Abrechnung", "Sauberkeit oder Sicherheit", "Sonstiges"] as const;
export type ComplaintInput = { location: string; category: string; description: string; name: string; email: string; consent: true };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const limits = { location: 160, description: 5000, name: 120, email: 254 } as const;

export function validateComplaint(value: unknown): { ok: true; value: ComplaintInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Ungültige Eingabe." };
  const input = value as Record<string, unknown>;
  const result = { location: String(input.location ?? "").trim(), category: String(input.category ?? "").trim(), description: String(input.description ?? "").trim(), name: String(input.name ?? "").trim(), email: String(input.email ?? "").trim() };
  if (input.consent !== "yes" && input.consent !== true) return { ok: false, error: "Bitte der Bearbeitung zustimmen." };
  if (!result.location || result.location.length > limits.location) return { ok: false, error: "Bitte den Standort korrekt angeben." };
  if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(result.category)) return { ok: false, error: "Bitte eine gültige Kategorie auswählen." };
  if (result.description.length < 20 || result.description.length > limits.description) return { ok: false, error: "Die Schilderung muss zwischen 20 und 5.000 Zeichen enthalten." };
  if (!result.name || result.name.length > limits.name) return { ok: false, error: "Bitte den Namen korrekt angeben." };
  if (result.email.length > limits.email || !emailPattern.test(result.email)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
  return { ok: true, value: { ...result, consent: true } };
}
