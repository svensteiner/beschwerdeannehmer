import { isPlaceholderPet } from "../alma/protocol.ts";
import { akteCallerForCall } from "./call-contact.ts";
import { ownersAlign } from "./patient-query.ts";

export type AppointmentRow = {
  id: string;
  start_at: string | Date;
  minutes: number;
  owner_name: string;
  pet: string;
  kind: string;
  vet: string;
  channel: string;
  status: string;
  owner_phone: string;
  owner_email?: string;
  spoken_owner?: string;
};

export type DeskAppointment = {
  id: string;
  start_at: string;
  minutes: number;
  owner_name: string;
  pet: string;
  kind: string;
  vet: string;
  channel: string;
  status: string;
  owner_phone: string;
  owner_email: string;
};

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Leftover unique Patient must not fill Heute / Kalender / Sprechen-Bestätigen.
 * Owner-matched Walk-in Patient cards may keep Handy and inbox.
 */
export function akteContactForAppointment(
  pet: string,
  value: string | null | undefined,
  joinedOwner: string,
  spokenOwner?: string | null,
) {
  const contact = String(value ?? "").trim();
  if (!contact) return "";
  if (!isPlaceholderPet(pet)) return contact;
  const spoken = String(spokenOwner ?? "").trim();
  const joined = String(joinedOwner ?? "").trim();
  if (ownersAlign(joined, spoken)) return contact;
  if (joined && joined !== "Klientel" && spoken && spoken !== "Klientel" && joined !== spoken) {
    return "";
  }
  if ((!spoken || spoken === "Klientel") && joined && joined !== "Klientel") return "";
  return contact;
}

export function mapAppointmentRow(a: AppointmentRow): DeskAppointment {
  const spoken = a.spoken_owner ?? a.owner_name;
  const owner_name = akteCallerForCall(a.pet, a.owner_name, spoken);
  return {
    id: a.id,
    start_at: asIso(a.start_at),
    minutes: Number(a.minutes) || 20,
    owner_name,
    pet: a.pet,
    kind: a.kind,
    vet: a.vet,
    channel: a.channel,
    status: a.status || "gelegt",
    owner_phone: akteContactForAppointment(a.pet, a.owner_phone, a.owner_name, spoken),
    owner_email: akteContactForAppointment(a.pet, a.owner_email, a.owner_name, spoken),
  };
}

/** Same leftover rules for `/sprechen` Bestätigen after refresh. */
export function mapAppointmentConfirm(row: {
  pet: string;
  owner_name: string;
  phone?: string;
  email?: string;
  spoken_owner?: string;
}) {
  const spoken = row.spoken_owner ?? row.owner_name;
  return {
    pet: row.pet,
    owner: akteCallerForCall(row.pet, row.owner_name, spoken),
    phone: akteContactForAppointment(row.pet, row.phone, row.owner_name, spoken),
    email: akteContactForAppointment(row.pet, row.email, row.owner_name, spoken),
  };
}
