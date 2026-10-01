/**
 * Tafel names Silvia already offers. Vquadrat column stays null until the
 * admin fills the real field name. Do not invent PatientID / BesitzerTelefon.
 */

export type VquadratTafelFeld = {
  /** Name on the Silvia port. */
  tafel: string;
  /** Real Vquadrat name — admin fills. Never invent. */
  vquadrat: null;
};

export const VQUADRAT_TAFEL_AKTE = {
  pet: { tafel: "pet", vquadrat: null },
  owner: { tafel: "owner", vquadrat: null },
  phone: { tafel: "phone", vquadrat: null },
  email: { tafel: "email", vquadrat: null },
  chip: { tafel: "chip", vquadrat: null },
} as const satisfies Record<string, VquadratTafelFeld>;

export const VQUADRAT_TAFEL_SLOT = {
  start: { tafel: "start", vquadrat: null },
  pet: { tafel: "pet", vquadrat: null },
  owner: { tafel: "owner", vquadrat: null },
  reason: { tafel: "reason", vquadrat: null },
  status: { tafel: "status", vquadrat: null },
} as const satisfies Record<string, VquadratTafelFeld>;

export const VQUADRAT_TAFEL_KONTAKT = {
  owner: { tafel: "owner", vquadrat: null },
  phone: { tafel: "phone", vquadrat: null },
  email: { tafel: "email", vquadrat: null },
} as const satisfies Record<string, VquadratTafelFeld>;

export const VQUADRAT_TAFEL_STATUS = ["gelegt", "bestätigt", "abgesagt"] as const;

export function vquadratFelderOffen(): { gruppe: string; tafel: string; vquadrat: null }[] {
  const rows: { gruppe: string; tafel: string; vquadrat: null }[] = [];
  for (const feld of Object.values(VQUADRAT_TAFEL_AKTE)) {
    rows.push({ gruppe: "akte", tafel: feld.tafel, vquadrat: feld.vquadrat });
  }
  for (const feld of Object.values(VQUADRAT_TAFEL_SLOT)) {
    rows.push({ gruppe: "slot", tafel: feld.tafel, vquadrat: feld.vquadrat });
  }
  for (const feld of Object.values(VQUADRAT_TAFEL_KONTAKT)) {
    rows.push({ gruppe: "kontakt", tafel: feld.tafel, vquadrat: feld.vquadrat });
  }
  return rows;
}
