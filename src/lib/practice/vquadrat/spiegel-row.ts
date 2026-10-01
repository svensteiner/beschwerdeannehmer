/**
 * Tafel-shaped Spiegel row — safe for the desk UI. No node:crypto, no SQL.
 */

import { formatSlot } from "../../alma/hours.ts";
import type { PraxissoftwareOffer } from "../praxissoftware.ts";

export type PraxissoftwareSpiegelDraft = {
  pet: string;
  owner_name: string;
  phone: string;
  email: string;
  chip: string;
  slot_start: string;
  slot_reason: string;
  slot_status: string;
  vquadrat_ref: string;
};

export type PraxissoftwareSpiegelRow = PraxissoftwareSpiegelDraft & {
  id: string;
  created_at: string;
};

export function flattenPraxissoftwareOffer(offer: PraxissoftwareOffer): PraxissoftwareSpiegelDraft {
  return {
    pet: String(offer.akte?.pet || offer.slot?.pet || "").trim(),
    owner_name: String(offer.akte?.owner || offer.slot?.owner || offer.kontakt?.owner || "").trim(),
    phone: String(offer.akte?.phone || offer.kontakt?.phone || "").trim(),
    email: String(offer.akte?.email || offer.kontakt?.email || "").trim(),
    chip: String(offer.akte?.chip || "").trim(),
    slot_start: String(offer.slot?.start || "").trim(),
    slot_reason: String(offer.slot?.reason || "").trim(),
    slot_status: String(offer.slot?.status || "").trim(),
    vquadrat_ref: "",
  };
}

export function spiegelRowWorthKeeping(row: PraxissoftwareSpiegelDraft) {
  return Boolean(row.pet || row.owner_name || row.phone || row.email || row.chip || row.slot_start);
}

export function spiegelSlotKurz(iso: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return formatSlot(d);
}

export function spiegelRowLine(row: Pick<PraxissoftwareSpiegelDraft, "pet" | "owner_name" | "slot_start" | "slot_status">) {
  const parts: string[] = [];
  if (row.pet) parts.push(row.pet);
  if (row.owner_name && row.owner_name !== row.pet) parts.push(row.owner_name);
  const when = spiegelSlotKurz(row.slot_start);
  if (when) parts.push(when);
  if (row.slot_status) parts.push(row.slot_status);
  return parts.join(" · ") || "Tafel";
}
