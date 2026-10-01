/**
 * Public Vquadrat facts only — from https://www.vquadrat.at/veterinaer.php (BIZZSOFT).
 * Partner ports and “SQL Datenbank im Hintergrund” are named there.
 * None of them is a reception port for Silvia. No schema, DSN, COM, or file format is public.
 */

export const VQUADRAT_PUBLIC_SOURCE = "https://www.vquadrat.at/veterinaer.php" as const;

export const VQUADRAT_VENDOR = "BIZZSOFT" as const;

/** Named on the public product page — not a connection string. */
export const VQUADRAT_STORE = "SQL Datenbank im Hintergrund" as const;

export const VQUADRAT_PUBLIC_MODULES = [
  "Kalender",
  "Kundenverwaltung",
  "Patientenverwaltung",
] as const;

/**
 * Vendor partner ports from the public page. They are Vquadrat’s
 * lab / chip / pharmacy links — not Silvia adapters.
 */
export const VQUADRAT_PARTNER_PORTS = [
  "Animaldata.com",
  "Petcard.at",
  "Idexx Vetlab Station Interlink",
  "SCilVip",
  "Zoetis Fuse",
  "Laboklin",
  "JACOBY GM PHARMA",
  "ELORD (Richter Pharma)",
] as const;

const PARTNER_NEEDLES = [
  "animaldata",
  "petcard",
  "idexx",
  "scilvip",
  "scil",
  "zoetis",
  "laboklin",
  "jacoby",
  "elord",
  "richter pharma",
] as const;

export function isVquadratPartnerPort(label: string): boolean {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return false;
  return PARTNER_NEEDLES.some((needle) => t.includes(needle));
}

/** Nothing on the public site is a bindable reception protocol. */
export function vquadratBindableProtocol(_label?: string): null {
  return null;
}

/**
 * What a Vquadrat admin can unlock from the vendor side.
 * Cloud still cannot open the laptop or reverse-engineer the Windows app.
 */
export const VQUADRAT_ADMIN_NEEDS = [
  "reception-port-kind",
  "kunde-patient-termin-fields",
  "redacted-sample",
] as const;

export type VquadratAdminNeed = (typeof VQUADRAT_ADMIN_NEEDS)[number];

export function vquadratAdminNeeds(): readonly VquadratAdminNeed[] {
  return VQUADRAT_ADMIN_NEEDS;
}

export type VquadratPublicSurface = {
  source: typeof VQUADRAT_PUBLIC_SOURCE;
  vendor: typeof VQUADRAT_VENDOR;
  store: typeof VQUADRAT_STORE;
  modules: typeof VQUADRAT_PUBLIC_MODULES;
  partnerPorts: typeof VQUADRAT_PARTNER_PORTS;
  bindable: null;
};

export function vquadratPublicSurface(): VquadratPublicSurface {
  return {
    source: VQUADRAT_PUBLIC_SOURCE,
    vendor: VQUADRAT_VENDOR,
    store: VQUADRAT_STORE,
    modules: VQUADRAT_PUBLIC_MODULES,
    partnerPorts: VQUADRAT_PARTNER_PORTS,
    bindable: vquadratBindableProtocol(),
  };
}
