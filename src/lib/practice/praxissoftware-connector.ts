/**
 * HTTP client for `silvia-connector` (C:\silvia-connector, see openapi.yaml).
 * Server-only: reads SILVIA_PMS_TOKEN, never ships to the browser (no VITE_).
 * 1.5 s timeout per call — a Connector outage must never block a call or a page load.
 * `sendAkte`/`sendSlot`/`sendKontakt` stay `notConnected` on purpose (Tafel-only paths).
 * `createAppointment` (AP 7d) is the one live write: POST /appointments, gated end-to-end
 * by the Connector's own `options.write.appointment` + `SILVIA_WRITE_LIVE`/`SILVIA_WRITE_TEST`
 * guards — this client never decides live-vs-test, it only maps the HTTP result.
 */

import {
  notConnected,
  notConnectedRead,
  notConnectedWrite,
  type ConnectorAppointmentRequest,
  type ConnectorAppointmentResult,
  type ConnectorCapabilities,
  type ConnectorHealth,
  type ConnectorHours,
  type ConnectorOwner,
  type ConnectorPatient,
  type ConnectorResource,
  type ConnectorSlot,
  type ConnectorVet,
  type PraxissoftwareKind,
  type PraxissoftwarePort,
  type PraxissoftwareReadResult,
  type PraxissoftwareWriteResult,
} from "./praxissoftware.ts";

const DEFAULT_TIMEOUT_MS = 1500;

/** Verhindert, dass eine Konfiguration den Server als SSRF-Brücke missbraucht. */
export function validConnectorBaseUrl(raw: string, env: Record<string, string | undefined> = process.env): string | null {
  let url: URL;
  try { url = new URL(String(raw ?? "").trim()); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
  const internalName = host.endsWith(".local") || host.endsWith(".internal") || host === "0.0.0.0";
  if (!loopback && (privateIpv4 || internalName || host.includes(":"))) return null;
  const localTest = String(env.SILVIA_PMS_LOCAL_TEST ?? "").trim() === "1";
  if (url.protocol !== "https:" && (!loopback || (String(env.NODE_ENV) === "production" && !localTest))) return null;
  return url.toString().replace(/\/$/, "");
}

export type ConnectorClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
};

async function connectorGet<T>(
  cfg: ConnectorClientConfig,
  path: string,
  needsAuth = true,
): Promise<PraxissoftwareReadResult<T>> {
  const base = validConnectorBaseUrl(cfg.baseUrl);
  if (!base) return notConnectedRead<T>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (needsAuth) headers.Authorization = `Bearer ${cfg.token}`;
    const res = await fetch(`${base}${path}`, { method: "GET", headers, signal: controller.signal, redirect: "error" });
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /appointments (AP 7d, live write path). 409 (slot taken) => `conflict`, 403 (write
 * gate closed) => `forbidden`, any other non-2xx or network failure => `error`. Never throws.
 */
async function connectorPostAppointment(
  cfg: ConnectorClientConfig,
  body: ConnectorAppointmentRequest,
): Promise<PraxissoftwareWriteResult<ConnectorAppointmentResult>> {
  const base = validConnectorBaseUrl(cfg.baseUrl);
  if (!base) return notConnectedWrite<ConnectorAppointmentResult>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/appointments`, {
      method: "POST",
      // A connector must never forward practice requests to another endpoint.
      redirect: "error",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 409) return { ok: false, reason: "conflict" };
    if (res.status === 403) return { ok: false, reason: "forbidden" };
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as ConnectorAppointmentResult;
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Thin fetch wrapper — one method per Connector endpoint used by Silvia (read-only). */
export function createConnectorClient(cfg: ConnectorClientConfig) {
  return {
    health: () => connectorGet<ConnectorHealth>(cfg, "/health", false),
    capabilities: () => connectorGet<ConnectorCapabilities>(cfg, "/capabilities"),
    findOwners: (params: { phone?: string; name?: string }) => {
      const qs = new URLSearchParams();
      if (params.phone) qs.set("phone", params.phone);
      if (params.name) qs.set("name", params.name);
      return connectorGet<ConnectorOwner[]>(cfg, `/owners?${qs.toString()}`);
    },
    patientsOf: (ownerId: string) =>
      connectorGet<ConnectorPatient[]>(cfg, `/owners/${encodeURIComponent(ownerId)}/patients`),
    resources: () => connectorGet<ConnectorResource[]>(cfg, "/resources"),
    vets: () => connectorGet<ConnectorVet[]>(cfg, "/vets"),
    freeSlots: (params: { date: string; resourceId: string; minutes: number }) => {
      const qs = new URLSearchParams({
        date: params.date,
        resource: params.resourceId,
        minutes: String(params.minutes),
      });
      return connectorGet<ConnectorSlot[]>(cfg, `/slots?${qs.toString()}`);
    },
    hours: () => connectorGet<ConnectorHours>(cfg, "/hours"),
    createAppointment: (body: ConnectorAppointmentRequest) => connectorPostAppointment(cfg, body),
  };
}

/** Wraps the client as a full `PraxissoftwarePort` — reads AND the appointment write go to the Connector. */
export function connectorPraxissoftwarePort(opts: {
  kind: PraxissoftwareKind;
  label: string;
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}): PraxissoftwarePort {
  const client = createConnectorClient({ baseUrl: opts.baseUrl, token: opts.token, timeoutMs: opts.timeoutMs });
  return {
    kind: opts.kind,
    label: opts.label,
    host: "other-pc",
    sendAkte: () => notConnected(),
    sendSlot: () => notConnected(),
    sendKontakt: () => notConnected(),
    createAppointment: (request) => client.createAppointment(request),
    health: () => client.health(),
    capabilities: () => client.capabilities(),
    findOwners: (params) => client.findOwners(params),
    patientsOf: (ownerId) => client.patientsOf(ownerId),
    resources: () => client.resources(),
    vets: () => client.vets(),
    freeSlots: (params) => client.freeSlots(params),
    hours: () => client.hours(),
  };
}
