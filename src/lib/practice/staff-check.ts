import { isStrongEnoughPassword, normalizeEmail } from "./crypto-shared.ts";
import { sanitizeStaffRole } from "./staff-role.ts";

export function inviteStaffCheck(input: {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  role?: string;
}) {
  const name = String(input?.name ?? "").trim();
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");
  const confirm = String(input?.confirm ?? "");
  const role = sanitizeStaffRole(String(input?.role ?? ""));
  if (name.length < 2) {
    return { ok: false as const, error: "Bitte den Namen der Kollegin angeben." };
  }
  if (!email.includes("@")) {
    return { ok: false as const, error: "Bitte eine gültige E-Mail angeben." };
  }
  if (!role) {
    return { ok: false as const, error: "Rolle ist Tierarzthelferin oder Inhaberin." };
  }
  if (password !== confirm) {
    return { ok: false as const, error: "Die Passwörter stimmen nicht überein." };
  }
  if (!isStrongEnoughPassword(password)) {
    return { ok: false as const, error: "Das Passwort braucht mindestens acht Zeichen." };
  }
  return {
    ok: true as const,
    name: name.slice(0, 80),
    email: email.slice(0, 160),
    password,
    role,
  };
}

/** Inhaberin sets a colleague password without the previous one — no SMTP. */
export function resetStaffPasswordCheck(input: { id?: string; password?: string; confirm?: string }) {
  const id = String(input?.id ?? "").slice(0, 80);
  const password = String(input?.password ?? "");
  const confirm = String(input?.confirm ?? "");
  if (!id) {
    return { ok: false as const, error: "Kollegin nicht gefunden." };
  }
  if (password !== confirm) {
    return { ok: false as const, error: "Die Passwörter stimmen nicht überein." };
  }
  if (!isStrongEnoughPassword(password)) {
    return { ok: false as const, error: "Das Passwort braucht mindestens acht Zeichen." };
  }
  return { ok: true as const, id, password };
}
