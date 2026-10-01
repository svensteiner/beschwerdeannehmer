/**
 * Connector-Anbindung fuer den Alma-Dialog.
 *
 * Aus `ask-alma.ts` ausgelagert (Punkt 9 der Code-Durchsicht): Die Uebersetzung
 * zwischen Praxissoftware-Connector und Silvias Aktenform liegt hier
 * beisammen. Alle Funktionen sind lesend und duerfen nie werfen - ein
 * Connector-Ausfall darf den Anruf nicht abbrechen, Silvia arbeitet dann von
 * der Tafel weiter.
 */
import { formatSlot } from "./hours.ts";
import { LLM_EXCERPT_LIMIT } from "./llm.ts";
import type { Patient } from "./patients.ts";
import type {
  ConnectorOwner,
  ConnectorPatient,
  PraxissoftwarePort,
} from "@/lib/practice/praxissoftware";

/**
 * Connector-Akte -> Silvias Patient.
 * Felder, die der Connector nicht liefert (oder nur als Platzhalter), bleiben
 * -unbekannt- und werden nie geraten.
 */
export function mapConnectorPatient(
  owner: ConnectorOwner,
  p: ConnectorPatient,
): Patient {
  const notes = [
    p.cave ? `Cave${p.caveText ? `: ${p.caveText}` : ""}` : "",
    p.permanentMed ? `Dauermedikation: ${p.permanentMed}` : "",
    p.deceased ? "verstorben" : "",
  ]
    .filter(Boolean)
    .join(" - ");
  return {
    chip: p.chip ?? "",
    name: p.name,
    species: p.species ?? "Heimtier",
    breed: p.breed ?? "",
    born: p.birth ?? "",
    owner: owner.name,
    phone: owner.phones[0] ?? "",
    lastVaccine: "unbekannt",
    rabies: "unbekannt",
    registered: false,
    notes,
    source: "stamm",
  };
}

/**
 * Rufnummer/Name aus dem Anruf -> Halterin -> Patienten via Connector (read-only).
 * Nur fuer einen eingehenden Anruf (`inbound`-Profil); `aclPatientExcerpt` /
 * `llmPatientPrompt` setzen dieselbe Fremddaten-Schwaerzung wie bei Tafel-Akten.
 * Jeder Connector-Fehler ergibt `[]` - Silvia arbeitet von der Tafel weiter,
 * kein Fehler erreicht die anrufende Person.
 */
export async function connectorPatientsFor(
  adapter: PraxissoftwarePort,
  spoken: string,
): Promise<Patient[]> {
  const { practiceKbNeedles } = await import("@/lib/practice/practice-kb");
  const needles = practiceKbNeedles(spoken);
  if (!needles.phone && !needles.owner) return [];
  const caps = await adapter.capabilities();
  if (!caps.ok || !caps.data.read.owners || !caps.data.read.patients) return [];
  const owners = await adapter.findOwners({
    phone: needles.phone || undefined,
    name: needles.owner || undefined,
  });
  if (!owners.ok || !owners.data.length) return [];
  const out: Patient[] = [];
  for (const owner of owners.data.slice(0, 3)) {
    const patients = await adapter.patientsOf(owner.id);
    if (!patients.ok) continue;
    for (const p of patients.data) out.push(mapConnectorPatient(owner, p));
    if (out.length >= LLM_EXCERPT_LIMIT) break;
  }
  return out.slice(0, LLM_EXCERPT_LIMIT);
}

/**
 * freeSlots()-Hinweis fuer die Terminantwort, formatiert wie `slotFor()`.
 * `null` bedeutet: den alten Pfad beibehalten.
 */
export async function connectorSlotFor(
  adapter: PraxissoftwarePort,
  preferredDate?: string,
): Promise<string | null> {
  const caps = await adapter.capabilities();
  if (!caps.ok || !caps.data.read.slots) return null;
  // Gleiche Slot-Wahl wie die Buchung (booking.ts): nie eine vergangene Uhrzeit.
  const { nextConnectorSlot } = await import("./booking");
  const slot = await nextConnectorSlot(adapter, undefined, undefined, preferredDate);
  if (slot.kind !== "slot") return null;
  const start = new Date(slot.start);
  if (Number.isNaN(start.getTime())) return null;
  return formatSlot(start);
}

/** Ein einzelner Patienteneintrag aus dem Connector, defensiv begrenzt. */
export function cleanPatient(p: Partial<Patient>): Patient | null {
  const name = String(p?.name ?? "")
    .trim()
    .slice(0, 40);
  if (name.length < 2) return null;
  return {
    chip: String(p.chip ?? "")
      .replace(/\D/g, "")
      .slice(0, 16),
    name,
    species: String(p.species ?? "Heimtier").slice(0, 20),
    breed: String(p.breed ?? "").slice(0, 40),
    born: String(p.born ?? "").slice(0, 12),
    owner: String(p.owner ?? "Klientel").slice(0, 60),
    phone: String(p.phone ?? "").slice(0, 24),
    lastVaccine: String(p.lastVaccine ?? "unbekannt").slice(0, 80),
    rabies: String(p.rabies ?? "unbekannt").slice(0, 80),
    registered: Boolean(p.registered),
    notes: String(p.notes ?? "").slice(0, 240),
    lastVisit: p.lastVisit ? String(p.lastVisit).slice(0, 120) : undefined,
    nextDue: p.nextDue ? String(p.nextDue).slice(0, 120) : undefined,
    warnings: p.warnings ? String(p.warnings).slice(0, 160) : undefined,
  };
}
