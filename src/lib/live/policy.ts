/**
 * Live-Wrapper, Stufe 1: Freigabe-Politik (fail-closed).
 *
 * Produktiver Live-Betrieb (GPT-Live-1) ist nur erlaubt, wenn ALLE Bedingungen
 * erfüllt sind. Fehlt eine, bleibt Live aus und der lokale Weg (Premium) gilt.
 * Trennung von Stimme und Daten: OpenAI bekommt nur das laufende Gespräch;
 * Termine, Notizen und Akten bleiben auf unserem Server.
 *
 * Reine Funktion ohne IO, damit Preflight, Start und Tests dieselbe Regel nutzen.
 */
type Env = Record<string, string | undefined>;

/** Nur diese Hosts dürfen Gesprächsaudio erhalten (EU-Datenresidenz). */
export const LIVE_ALLOWED_HOSTS = ["eu.api.openai.com"] as const;

export type LivePolicyReason =
  | "not_enabled"
  | "no_api_key"
  | "base_url_missing"
  | "base_url_invalid"
  | "base_url_not_eu"
  | "proxy_active"
  | "zdr_not_attested"
  | "zdr_attestation_stale"
  | "dpa_missing"
  | "data_region_not_at"
  | "database_missing"
  | "persistent_demo_sandbox";

export type LivePolicy =
  | { ok: true; httpBase: string; wsBase: string; zdrAttestedAt: string; dpaRef: string }
  | { ok: false; reasons: LivePolicyReason[] };

/** ZDR-Bestätigung von OpenAI gilt höchstens ein Jahr, danach neu bestätigen. */
export const ZDR_ATTESTATION_MAX_AGE_DAYS = 365;

function proxyActive(env: Env): boolean {
  const flag = String(env.NODE_USE_ENV_PROXY ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true") return true;
  return ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
    .some((key) => Boolean(String(env[key] ?? "").trim()));
}

/** Gültige EU-Basis-URL (https, kein Login in der URL, kein Pfad, erlaubter Host) oder Grund. */
export function parseLiveBaseUrl(raw: string | undefined):
  | { ok: true; host: string }
  | { ok: false; reason: "base_url_missing" | "base_url_invalid" | "base_url_not_eu" } {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, reason: "base_url_missing" };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: "base_url_invalid" }; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port) {
    return { ok: false, reason: "base_url_invalid" };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "/v1") return { ok: false, reason: "base_url_invalid" };
  const host = url.hostname.toLowerCase();
  if (!(LIVE_ALLOWED_HOSTS as readonly string[]).includes(host)) return { ok: false, reason: "base_url_not_eu" };
  return { ok: true, host };
}

export function resolveLivePolicy(env: Env = process.env, now: Date = new Date()): LivePolicy {
  const reasons: LivePolicyReason[] = [];
  if (String(env.SILVIA_LIVE_PROD_ENABLED ?? "").trim() !== "1") reasons.push("not_enabled");
  if (!String(env.OPENAI_API_KEY ?? "").trim()) reasons.push("no_api_key");

  const base = parseLiveBaseUrl(env.SILVIA_LIVE_BASE_URL);
  if (!base.ok) reasons.push(base.reason);
  if (proxyActive(env)) reasons.push("proxy_active");

  // ZDR: schriftliche Freigabe von OpenAI, als Datum (YYYY-MM-DD) hinterlegt.
  const attested = String(env.SILVIA_LIVE_ZDR_ATTESTED ?? "").trim();
  const attestedAt = /^\d{4}-\d{2}-\d{2}$/.test(attested) ? new Date(`${attested}T00:00:00Z`) : null;
  if (!attestedAt || Number.isNaN(attestedAt.getTime()) || attestedAt.getTime() > now.getTime()) {
    reasons.push("zdr_not_attested");
  } else if (now.getTime() - attestedAt.getTime() > ZDR_ATTESTATION_MAX_AGE_DAYS * 86_400_000) {
    reasons.push("zdr_attestation_stale");
  }

  const dpaRef = String(env.SILVIA_LIVE_DPA_REF ?? "").trim();
  if (dpaRef.length < 3) reasons.push("dpa_missing");

  // Zentraler Server in Österreich, echte Datenbank (kein RAM-Sandbox-Modus).
  if (String(env.SILVIA_DATA_REGION ?? "").trim().toUpperCase() !== "AT") reasons.push("data_region_not_at");
  if (!String(env.DATABASE_URL ?? "").trim()) reasons.push("database_missing");
  // Die synthetische Demo-Sandbox und der Produktivbetrieb schließen sich aus.
  if (String(env.SILVIA_LIVE_DEMO_SANDBOX ?? "").trim() === "1") reasons.push("persistent_demo_sandbox");

  if (reasons.length > 0 || !base.ok) return { ok: false, reasons };
  return {
    ok: true,
    httpBase: `https://${base.host}/v1`,
    wsBase: `wss://${base.host}/v1`,
    zdrAttestedAt: attested,
    dpaRef,
  };
}

/** Deutsche Klartexte für Preflight und Status (nie Schlüssel oder Werte ausgeben). */
export const LIVE_POLICY_TEXT: Record<LivePolicyReason, string> = {
  not_enabled: "SILVIA_LIVE_PROD_ENABLED=1 fehlt.",
  no_api_key: "OPENAI_API_KEY fehlt (nur serverseitig).",
  base_url_missing: "SILVIA_LIVE_BASE_URL fehlt (erwartet https://eu.api.openai.com/v1).",
  base_url_invalid: "SILVIA_LIVE_BASE_URL ist ungültig (nur https, ohne Login, Port oder Query).",
  base_url_not_eu: "SILVIA_LIVE_BASE_URL zeigt nicht auf den EU-Endpunkt.",
  proxy_active: "Ein Proxy ist aktiv; Gesprächsaudio darf keinen Umweg nehmen.",
  zdr_not_attested: "SILVIA_LIVE_ZDR_ATTESTED (YYYY-MM-DD der OpenAI-ZDR-Freigabe) fehlt.",
  zdr_attestation_stale: "Die ZDR-Bestätigung ist älter als ein Jahr und muss erneuert werden.",
  dpa_missing: "SILVIA_LIVE_DPA_REF (Vertragskennung des DPA) fehlt.",
  data_region_not_at: "SILVIA_DATA_REGION=AT fehlt (Server muss in Österreich stehen).",
  database_missing: "DATABASE_URL fehlt (zentrale Postgres-Datenbank nötig).",
  persistent_demo_sandbox: "Die Demo-Sandbox ist aktiv; Produktiv und Demo schließen sich aus.",
};
