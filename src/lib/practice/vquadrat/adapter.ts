/**
 * First Praxissoftware adapter: Vquadrat Veterinär.
 * Vquadrat stays on the laptop (sales bag at the customer). Do not install
 * the live Tafel `/app` there.
 * No SILVIA_PMS_URL configured => stub (no network, no invented API).
 * SILVIA_PMS_URL set => talks to `silvia-connector` (C:\silvia-connector),
 * never to Firebird/vquadrat directly. Next vendor = own file, same port.
 */

import { connectorPraxissoftwarePort } from "../praxissoftware-connector.ts";
import { appointmentWriteApproved } from "../booking-approval.ts";
import {
  stubPraxissoftwarePort,
  VQUADRAT_KIND,
  VQUADRAT_LABEL,
  type PraxissoftwareKind,
  type PraxissoftwarePort,
} from "../praxissoftware.ts";

type Env = Record<string, string | undefined>;

export function vquadratAdapter(env: Env = process.env): PraxissoftwarePort {
  const baseUrl = String(env.SILVIA_PMS_URL ?? "").trim();
  const token = String(env.SILVIA_PMS_TOKEN ?? "").trim();
  // A URL alone must never turn on the bridge: without its server-only
  // credential it would send an empty Bearer header to a real connector.
  if (baseUrl && token) {
    return connectorPraxissoftwarePort({ kind: VQUADRAT_KIND, label: VQUADRAT_LABEL, baseUrl, token });
  }
  return stubPraxissoftwarePort(VQUADRAT_KIND, VQUADRAT_LABEL);
}

export type PraxissoftwareStatusView = {
  kind: PraxissoftwareKind;
  label: string;
  connected: boolean;
  line: string;
  /** Klartext für Einstellungen: erst nach expliziter Schreibfreigabe sichtbar. */
  bookingLine: string;
};

/**
 * Einstellungen status line — from `/health` + `/capabilities`, never from a raw ping to
 * Firebird. 1.5 s Connector timeout applies (see praxissoftware-connector.ts); on any failure
 * this reads "nicht erreichbar", never throws into the settings loader.
 */
export async function vquadratStatusView(env: Env = process.env): Promise<PraxissoftwareStatusView> {
  const adapter = vquadratAdapter(env);
  const [health, caps] = await Promise.all([adapter.health(), adapter.capabilities()]);
  const connected = health.ok && health.data.ok && caps.ok;
  const bookingLive = connected && caps.ok && appointmentWriteApproved(caps.data, env);
  return {
    kind: VQUADRAT_KIND,
    label: VQUADRAT_LABEL,
    connected,
    line: connected
      ? `Praxissoftware: ${VQUADRAT_LABEL} — verbunden (nur lesen)`
      : `Praxissoftware: ${VQUADRAT_LABEL} — nicht erreichbar`,
    bookingLine: bookingLive
      ? "Termine: werden in Vquadrat eingetragen"
      : "Termine: werden nur vorgemerkt",
  };
}
