export const MAX_STAFF = 8;
export const STAFF_ROLES = ["inhaberin", "kassa"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  self: boolean;
};

export const INHABERIN_SETTINGS_ERROR =
  "Nur die Inhaberin ändert Adresse, Zeiten und Nachtdienst.";

/** Visible role. Stored value stays `kassa` so existing Tafeln keep working. */
export const TIERARZTHELFERIN_LABEL = "Tierarzthelferin";

export function sanitizeStaffRole(raw: string): StaffRole | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "kassa" || value === "tierarzthelferin") return "kassa";
  if (value === "inhaberin") return "inhaberin";
  return null;
}

export function isInhaberin(role: string | null | undefined) {
  return sanitizeStaffRole(String(role ?? "")) === "inhaberin";
}

export function staffRoleLabel(role: string) {
  return role === "kassa" ? TIERARZTHELFERIN_LABEL : "Inhaberin";
}
