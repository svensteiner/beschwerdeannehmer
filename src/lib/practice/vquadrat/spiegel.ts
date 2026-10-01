/**
 * Local Spiegel of what the Tafel already offered the Vquadrat port.
 * Columns are Tafel names. `vquadrat_ref` stays empty until the admin fills
 * a real vendor key — do not invent PatientID / BesitzerTelefon.
 */

import type { Sql } from "../../db.ts";
import {
  bridgePraxissoftware,
  type PraxissoftwareBridge,
  type PraxissoftwareOffer,
} from "../praxissoftware.ts";
import {
  flattenPraxissoftwareOffer,
  spiegelRowWorthKeeping,
  type PraxissoftwareSpiegelRow,
} from "./spiegel-row.ts";

export const SPIEGEL_LIMIT = 16;

export {
  flattenPraxissoftwareOffer,
  spiegelRowLine,
  spiegelRowWorthKeeping,
  spiegelSlotKurz,
} from "./spiegel-row.ts";
export type { PraxissoftwareSpiegelDraft, PraxissoftwareSpiegelRow } from "./spiegel-row.ts";

export async function writePraxissoftwareSpiegel(
  sql: Sql,
  practiceId: string,
  offer: PraxissoftwareOffer,
) {
  const { newId } = await import("../crypto.ts");
  const row = flattenPraxissoftwareOffer(offer);
  if (!spiegelRowWorthKeeping(row)) return null;
  const id = newId();
  await sql`
    insert into praxissoftware_spiegel (
      id, practice_id, pet, owner_name, phone, email, chip,
      slot_start, slot_reason, slot_status, vquadrat_ref
    ) values (
      ${id},
      ${practiceId},
      ${row.pet},
      ${row.owner_name},
      ${row.phone},
      ${row.email},
      ${row.chip},
      ${row.slot_start},
      ${row.slot_reason},
      ${row.slot_status},
      ${row.vquadrat_ref}
    )
  `;
  return id;
}

export async function fetchPraxissoftwareSpiegel(
  sql: Sql,
  practiceId: string,
): Promise<PraxissoftwareSpiegelRow[]> {
  const rows = await sql<{
    id: string;
    pet: string;
    owner_name: string;
    phone: string;
    email: string;
    chip: string;
    slot_start: string;
    slot_reason: string;
    slot_status: string;
    vquadrat_ref: string;
    created_at: string | Date;
  }>`
    select id, pet, owner_name, phone, email, chip,
           slot_start, slot_reason, slot_status, vquadrat_ref, created_at
    from praxissoftware_spiegel
    where practice_id = ${practiceId}
    order by created_at desc
    limit ${SPIEGEL_LIMIT}
  `;
  return rows.map((r) => ({
    id: r.id,
    pet: r.pet,
    owner_name: r.owner_name,
    phone: r.phone,
    email: r.email,
    chip: r.chip,
    slot_start: r.slot_start,
    slot_reason: r.slot_reason,
    slot_status: r.slot_status,
    vquadrat_ref: r.vquadrat_ref,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
  }));
}

/**
 * Offer the Tafel write to the laptop port, then keep a local Spiegel row.
 * Never throws — a Spiegel miss must not fail the Tafel write.
 */
export async function offerTafelToSpiegel(
  sql: Sql,
  practiceId: string,
  label: string | null | undefined,
  offer: PraxissoftwareOffer,
): Promise<PraxissoftwareBridge> {
  const result = bridgePraxissoftware(label, offer);
  if ("skipped" in result && result.skipped) return result;
  try {
    await writePraxissoftwareSpiegel(sql, practiceId, offer);
  } catch {
    /* Tafel stays source of truth */
  }
  return result;
}
