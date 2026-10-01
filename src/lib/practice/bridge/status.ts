/**
 * Status-Zeile für Einstellungen (AP 45, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.6).
 * Ersetzt `vquadratStatusView` (bleibt als Alias erhalten, siehe `vquadrat/adapter.ts`)
 * durch eine Praxissoftware-neutrale Fassung mit zusätzlicher Bridge-Zeile
 * (Halter/Patienten-Zahlen, letzter Sync, offene Outbox).
 */
import { adapterFor } from "./adapters.ts";
import type { PraxissoftwareKind } from "../praxissoftware.ts";
import { appointmentWriteApproved } from "../booking-approval.ts";

export type PraxissoftwareStatusView = {
  kind: PraxissoftwareKind | string;
  label: string;
  connected: boolean;
  line: string;
  bookingLine: string;
  /** AP 45: Bridge-Zeile darunter — "Bridge: 12 Halter, 31 Patienten, zuletzt synchronisiert vor 4 min, Outbox 0 offen". */
  bridgeLine: string;
};

function minutesAgo(at: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
}

/** Kein Sync-Stand verfügbar — die Datenbank ist nicht abrufbar. */
export const BRIDGE_LINE_UNKNOWN = "Bridge: Status derzeit nicht abrufbar";

/** Kein Stammdatenabgleich gelaufen — die Bridge ist eingerichtet, aber leer. */
export const BRIDGE_LINE_NEVER = "Bridge: noch nicht synchronisiert";

/**
 * Reine Formatierung — kein DB-/Netzwerkzugriff, leicht testbar.
 *
 * Zeigt auch laufende Übertragungen (`processingOutbox`) und abgewiesene
 * Buchungen (`failedOutbox` umfasst `failed`, `conflict` und `forbidden`).
 *
 * Die Warnung steht auch dann, wenn noch kein Stammdatenabgleich gelaufen ist.
 * Sonst verschwanden vorhandene Buchungsfehler hinter „noch nicht
 * synchronisiert“ — genau der Fall, in dem niemand nach ihnen sucht.
 */
export function formatBridgeLine(
  stats: {
    owners: number;
    patients: number;
    pendingOutbox: number;
    processingOutbox?: number;
    failedOutbox?: number;
    lastMasterSyncAt: Date | null;
  },
  now: Date = new Date(),
): string {
  const failed = stats.failedOutbox ?? 0;
  // Klartext für die Inhaberin: diese Termine stehen NICHT in der Praxissoftware.
  const warning = failed > 0
    ? `Achtung: ${failed} ${failed === 1 ? "Termin wurde" : "Termine wurden"} nicht eingetragen, bitte von Hand in der Praxissoftware prüfen`
    : "";
  if (!stats.lastMasterSyncAt) {
    return warning ? `${BRIDGE_LINE_NEVER} — ${warning}` : BRIDGE_LINE_NEVER;
  }
  const mins = minutesAgo(stats.lastMasterSyncAt, now);
  const agoText = mins < 1 ? "gerade eben" : `vor ${mins} min`;
  const processing = stats.processingOutbox ?? 0;
  const parts = [
    `${stats.pendingOutbox} offen`,
    ...(processing > 0 ? [`${processing} laufend`] : []),
  ];
  const base = `Bridge: ${stats.owners} Halter, ${stats.patients} Patienten, zuletzt synchronisiert ${agoText}, Outbox ${parts.join(", ")}`;
  return warning ? `${base} — ${warning}` : base;
}

/**
 * Status-Zeile — from `/health` + `/capabilities` des Adapters, plus Bridge-Zählwerte.
 *
 * Wirft nie: auch ein werfender Adapter darf die Einstellungen-Seite nicht
 * abstürzen lassen. Früher standen `health()` und `capabilities()` außerhalb
 * der Fehlerbehandlung, obwohl der Vertrag „wirft nie“ lautet.
 */
export async function praxissoftwareStatusView(
  practiceId: string,
  pmsLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PraxissoftwareStatusView> {
  const adapter = adapterFor(pmsLabel, env);
  let connected = false;
  let bookingLive = false;
  let canWrite = false;
  try {
    const [health, caps] = await Promise.all([adapter.health(), adapter.capabilities()]);
    connected = health.ok && health.data.ok && caps.ok;
    bookingLive = connected && caps.ok && appointmentWriteApproved(caps.data, env);
    // Schreibfaehigkeit aus den Faehigkeiten des Anschlusses ableiten, damit
    // die Statuszeile nicht „nur lesen“ sagt und darunter einen Schreibvorgang
    // ankuendigt.
    canWrite = connected && caps.ok && caps.data.write.appointment === true;
  } catch {
    // Adapter wirft trotz Vertrag: als „nicht erreichbar“ behandeln.
    connected = false;
    bookingLive = false;
    canWrite = false;
  }

  let bridgeLine = BRIDGE_LINE_UNKNOWN;
  try {
    const { getSql } = await import("@/lib/db.server");
    const { bridgeRepo } = await import("./repo.ts");
    const sql = await getSql();
    const stats = await bridgeRepo(sql).stats({ practiceId, pmsKind: adapter.kind });
    bridgeLine = formatBridgeLine(stats);
  } catch {
    // Bridge-DB nicht erreichbar/gebootet. Das ist deutlich zu sagen: „noch
    // nicht synchronisiert“ würde einen unbenutzten Stand vortäuschen.
    bridgeLine = BRIDGE_LINE_UNKNOWN;
  }

  return {
    kind: adapter.kind,
    label: adapter.label,
    connected,
    line: connected
      // „nur lesen“ nur, wenn der Anschluss wirklich nicht schreiben kann.
      ? `Praxissoftware: ${adapter.label} — verbunden (${canWrite ? "lesen und Termine" : "nur lesen"})`
      : `Praxissoftware: ${adapter.label} — nicht erreichbar`,
    bookingLine: bookingLive
      // Der Name kommt aus dem Adapter, nicht fest aus „Vquadrat“: weitere
      // Praxisprogramme nutzen dieselbe Bridge.
      ? `Termine: werden in ${adapter.label} eingetragen`
      : "Termine: werden nur vorgemerkt",
    bridgeLine,
  };
}
