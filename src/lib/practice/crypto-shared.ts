export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Obergrenze für Passwörter. Registrieren und Ändern halten sich daran; die
 * Anmeldung prüft dieselbe Grenze, damit ein überlanges Passwort nicht erst
 * durch scrypt läuft.
 */
export const MAX_PASSWORD_LENGTH = 200;

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8 && password.length <= MAX_PASSWORD_LENGTH;
}

export function passwordChangeCheck(current: string, next: string, confirm: string) {
  if (!String(current ?? "")) return { ok: false as const, error: "Bitte das bisherige Passwort angeben." };
  if (String(next ?? "") !== String(confirm ?? "")) return { ok: false as const, error: "Die neuen Passwörter stimmen nicht überein." };
  if (!isStrongEnoughPassword(next)) return { ok: false as const, error: "Das neue Passwort braucht mindestens acht Zeichen." };
  if (current === next) return { ok: false as const, error: "Bitte ein anderes Passwort wählen." };
  return { ok: true as const };
}
