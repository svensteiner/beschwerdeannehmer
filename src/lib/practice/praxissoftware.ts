/**
 * Vendor-neutral Praxissoftware port.
 * First adapter: Vquadrat Veterinär (`vquadrat`) on the laptop — not Silvia.
 * Sales at the customer is that same laptop (`PRESENTATION_HOST`): Huber `/demo`,
 * `/`, `/preise`, `/werkzeuge`. Live Tafel `/app` stays on the Praxis-PC.
 * Next vendor = new adapter file, same port. No invented REST, Twilio, SMTP, or live sync.
 * Public Vquadrat partner ports and SQL-in-background live in
 * `vquadrat/oeffentlich.ts` (`vquadratPublicSurface`) — not bindable.
 *
 * Read methods (capabilities/findOwners/patientsOf/resources/freeSlots/hours) talk to the
 * `silvia-connector` (see C:\silvia-connector), never to a vendor DB directly — Silvia only
 * knows this port, never Firebird/vquadrat SQL. Stubs (no SILVIA_PMS_URL, or "Noch keines"/
 * "Anderes") answer `notConnected` for every method, sync or async, never throw.
 */


export const VQUADRAT_KIND = "vquadrat" as const;
export const VQUADRAT_LABEL = "Vquadrat Veterinär";

/** Laptop in the bag at the customer — Huber demo and Vquadrat, not `/app`. */
export const PRESENTATION_HOST = "laptop" as const;

/** AP 41: "stub" = registrierter Platzhalter fuer unbekannte Praxissoftware (Registry). */
export const STUB_KIND = "stub" as const;

/**
 * Adapter-Schlüssel bleiben offen für künftige Anbieter. Die bekannten
 * Literale behalten ihre Autovervollständigung; neue Adapter müssen nur ihren
 * eigenen stabilen Schlüssel registrieren.
 */
export type PraxissoftwareKind =
  | typeof VQUADRAT_KIND
  | typeof STUB_KIND
  | (string & {});

/** What Silvia can send later — Tafel names, not vendor field names. */
export type PraxissoftwareAkte = {
  pet: string;
  owner?: string;
  phone?: string;
  email?: string;
  chip?: string;
};

export type PraxissoftwareSlot = {
  start: string;
  pet?: string;
  owner?: string;
  reason?: string;
  /** Tafel status — gelegt, bestätigt, abgesagt. */
  status?: "gelegt" | "bestätigt" | "abgesagt";
};

export type PraxissoftwareKontakt = {
  owner?: string;
  phone?: string;
  email?: string;
};

export type PraxissoftwareResult = { ok: false; reason: "notConnected" };

/** Read-path result. `timeout`/`error` cover a Connector that is up but unreachable/erroring. */
export type PraxissoftwareReadReason = "notConnected" | "timeout" | "error";

export type PraxissoftwareReadResult<T> =
  /**
   * `stale: true` heisst: die Praxissoftware war nicht erreichbar, die Daten
   * kommen aus dem Zwischenspeicher und koennen veraltet sein. Vorher waren sie
   * von frischen Daten nicht zu unterscheiden.
   */
  | { ok: true; data: T; stale?: true }
  | { ok: false; reason: PraxissoftwareReadReason };

/** Connector wire types — mirror C:\silvia-connector\openapi.yaml, never invented fields. */
export type ConnectorOwner = {
  id: string;
  name: string;
  phones: string[];
  email: string | null;
};

export type ConnectorPatient = {
  id: string;
  ownerId: string;
  name: string;
  species: string | null;
  breed: string | null;
  chip: string | null;
  birth: string | null;
  deceased: boolean;
  cave: boolean;
  caveText: string | null;
  permanentMed: string | null;
};

export type ConnectorResource = { id: string; name: string };
export type ConnectorVet = { id: string; name: string };
export type ConnectorSlot = { start: string; end: string };
export type ConnectorHours = {
  opening: { day: string; start: string; end: string }[];
  closedDays: string[];
};

export type ConnectorCapabilities = {
  read: { owners: boolean; patients: boolean; slots: boolean; vets: boolean; hours: boolean };
  write: { appointment: boolean };
};

export type ConnectorHealth = { ok: boolean; adapter: string; readOnly: boolean; version: string };

/** POST /appointments body — mirrors openapi.yaml `AppointmentRequest`. */
export type ConnectorAppointmentRequest = {
  ownerId: string;
  patientId: string;
  resourceId: string;
  vetId: string;
  start: string;
  minutes: number;
  reason?: string | null;
};

export type ConnectorAppointmentResult = { id: string; start: string; end: string };

/** `createAppointment()` write-path reasons — never thrown, always resolved. */
export type PraxissoftwareWriteReason = "notConnected" | "conflict" | "forbidden" | "error";

export type PraxissoftwareWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: PraxissoftwareWriteReason };

export type PraxissoftwarePort = {
  readonly kind: PraxissoftwareKind;
  readonly label: string;
  /** Vendor process is not Silvia. Laptop (demo bag) or a separate Vquadrat PC. */
  readonly host: typeof PRESENTATION_HOST | "other-pc";
  sendAkte(akte: PraxissoftwareAkte): PraxissoftwareResult;
  sendSlot(slot: PraxissoftwareSlot): PraxissoftwareResult;
  sendKontakt(kontakt: PraxissoftwareKontakt): PraxissoftwareResult;
  /** Read-only from here on — see AP 6. Always resolves, never throws. */
  health(): Promise<PraxissoftwareReadResult<ConnectorHealth>>;
  capabilities(): Promise<PraxissoftwareReadResult<ConnectorCapabilities>>;
  findOwners(params: { phone?: string; name?: string }): Promise<PraxissoftwareReadResult<ConnectorOwner[]>>;
  patientsOf(ownerId: string): Promise<PraxissoftwareReadResult<ConnectorPatient[]>>;
  resources(): Promise<PraxissoftwareReadResult<ConnectorResource[]>>;
  vets(): Promise<PraxissoftwareReadResult<ConnectorVet[]>>;
  freeSlots(params: {
    date: string;
    resourceId: string;
    minutes: number;
  }): Promise<PraxissoftwareReadResult<ConnectorSlot[]>>;
  hours(): Promise<PraxissoftwareReadResult<ConnectorHours>>;
  /**
   * Live write path (AP 7d). Stub/no-connector => `notConnected`. Connector 409 (slot
   * taken) => `conflict`; 403 (write gate closed) => `forbidden`; anything else => `error`.
   * Callers must fall back to the Tafel-only "Rezeption trägt ein" path on any non-`ok`.
   */
  createAppointment(
    request: ConnectorAppointmentRequest,
  ): Promise<PraxissoftwareWriteResult<ConnectorAppointmentResult>>;
};

/** Dropdown labels. Only `vquadrat` has an adapter; the rest stay labels. */
export const PMS_OPTIONS = [
  VQUADRAT_LABEL,
  "vetera",
  "easyVET",
  "pentavèt",
  "Animondo",
  "Vetinfoweb",
  "Noch keines",
  "Anderes",
] as const;

export type PmsOption = (typeof PMS_OPTIONS)[number];

export const PMS_DEFAULT: PmsOption = VQUADRAT_LABEL;

export const PMS_HINT_ID = "pms-hint";

export const PRAXISSOFTWARE_HINT =
  "Erste Kopplung Vquadrat Veterinär; andere Software später über dieselbe Schnittstelle.";

export function notConnected(): PraxissoftwareResult {
  return { ok: false, reason: "notConnected" };
}

/** Same shape, for the async read methods. */
export function notConnectedRead<T>(): PraxissoftwareReadResult<T> {
  return { ok: false, reason: "notConnected" };
}

async function notConnectedReadAsync<T>(): Promise<PraxissoftwareReadResult<T>> {
  return notConnectedRead<T>();
}

/** Same shape, for `createAppointment()`. */
export function notConnectedWrite<T>(): PraxissoftwareWriteResult<T> {
  return { ok: false, reason: "notConnected" };
}

async function notConnectedWriteAsync<T>(): Promise<PraxissoftwareWriteResult<T>> {
  return notConnectedWrite<T>();
}

/** Shared stub — adapters stay offline until a real vendor port exists. */
export function stubPraxissoftwarePort(kind: PraxissoftwareKind, label: string): PraxissoftwarePort {
  return {
    kind,
    label,
    host: PRESENTATION_HOST,
    sendAkte: () => notConnected(),
    sendSlot: () => notConnected(),
    sendKontakt: () => notConnected(),
    createAppointment: notConnectedWriteAsync,
    health: notConnectedReadAsync,
    capabilities: notConnectedReadAsync,
    findOwners: notConnectedReadAsync,
    patientsOf: notConnectedReadAsync,
    resources: notConnectedReadAsync,
    vets: notConnectedReadAsync,
    freeSlots: notConnectedReadAsync,
    hours: notConnectedReadAsync,
  };
}

export function praxissoftwareKindOf(label: string): PraxissoftwareKind | null {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === VQUADRAT_KIND || t === VQUADRAT_LABEL.toLowerCase()) return VQUADRAT_KIND;
  return null;
}

export function hasPraxissoftwareAdapter(label: string) {
  return praxissoftwareKindOf(label) !== null;
}

/**
 * Dropdown-driven lookup. Stays a stub — "Noch keines"/"Anderes" must never call out.
 * Bewusst OHNE Registry: diese Datei bleibt env-frei und importiert keine Adapter
 * (kein Zirkel mit `bridge/adapters.ts`). Der live, Bridge-aware Port kommt aus
 * `praxissoftware-runtime.ts` (`praxissoftwareRuntime`), nie von hier.
 */
export function praxissoftwareFor(kindOrLabel: string): PraxissoftwarePort | null {
  if (praxissoftwareKindOf(kindOrLabel) !== VQUADRAT_KIND) return null;
  return stubPraxissoftwarePort(VQUADRAT_KIND, VQUADRAT_LABEL);
}

/** Tafel names offered to the vendor after a local write. Never invents HTTP. */
export type PraxissoftwareOffer = {
  akte?: PraxissoftwareAkte;
  slot?: PraxissoftwareSlot;
  kontakt?: PraxissoftwareKontakt;
};

export type PraxissoftwareBridge =
  | PraxissoftwareResult
  | { skipped: true };

/**
 * Bridge: Tafel stays source of truth. Only Vquadrat has an adapter today;
 * it lives on the laptop and answers notConnected. Next vendor = same call.
 */
export function bridgePraxissoftware(
  label: string | null | undefined,
  offer: PraxissoftwareOffer,
): PraxissoftwareBridge {
  const port = praxissoftwareFor(String(label ?? ""));
  if (!port) return { skipped: true };
  if (offer.akte) port.sendAkte(offer.akte);
  if (offer.slot) port.sendSlot(offer.slot);
  if (offer.kontakt) port.sendKontakt(offer.kontakt);
  return notConnected();
}
