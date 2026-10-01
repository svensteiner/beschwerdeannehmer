/**
 * AP 20 — Status-Seite (nur Inhaberin). Ampeln für die Dienste, die eine Ordination
 * lokal am Praxis-PC braucht. Rein lesend: kein Schreibzugriff, keine Parameteränderung.
 */
import { createServerFn } from "@tanstack/react-start";
import { validConnectorBaseUrl } from "./praxissoftware-connector.ts";

export type Ampel = "gruen" | "gelb" | "rot";

export type ServiceCheck = {
  id: string;
  label: string;
  ampel: Ampel;
  /** Klartext: erster Satz sagt was ist, zweiter (bei Rot/Gelb) was zu tun ist. */
  detail: string;
  /** Nur im aufklappbaren Bereich „Für den Techniker" — Portnummer, Millisekunden. */
  technical?: string;
};

export type StatusAggregate = {
  generatedAt: string;
  services: ServiceCheck[];
  storage: ServiceCheck;
  retention: ServiceCheck;
};

export type ProbeResult = { ok: boolean; ms: number; reason?: "timeout" | "error" };

const DEFAULT_PROBE_TIMEOUT_MS = 1500;

/** Any HTTP response — even 404/500 — proves the process is listening; only a network failure means down. */
export async function probeService(url: string, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: "GET", signal: controller.signal });
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof Error && err.name === "AbortError") return { ok: false, ms, reason: "timeout" };
    return { ok: false, ms, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Builds the status endpoint only after applying the same connector boundary as live requests. */
export function connectorHealthUrl(raw: string, env: Record<string, string | undefined> = process.env): string | null {
  const baseUrl = validConnectorBaseUrl(raw, env);
  return baseUrl ? `${baseUrl}/health` : null;
}

export function serviceCheckFromProbe(
  id: string,
  label: string,
  port: number,
  result: ProbeResult,
  hostLabel?: string,
): ServiceCheck {
  const host = hostLabel?.trim() || `Port ${port}`;
  const technical = `${label}, ${host}${result.ok ? `, ${result.ms} ms` : ""}.`;
  if (!result.ok) {
    return {
      id,
      label,
      ampel: "rot",
      detail:
        result.reason === "timeout"
          ? `${label} antwortet nicht — Zeitüberschreitung. Bitte Silvia am Praxis-PC neu starten.`
          : `${label} ist nicht erreichbar. Bitte Silvia am Praxis-PC neu starten.`,
      technical,
    };
  }
  if (result.ms > 800) {
    return { id, label, ampel: "gelb", detail: `${label} läuft, antwortet aber langsam.`, technical };
  }
  return { id, label, ampel: "gruen", detail: `${label} läuft.`, technical };
}

export function connectorCheck(configured: boolean, result: ProbeResult | null): ServiceCheck {
  const label = "Verbindung zur Praxissoftware";
  if (!configured) {
    return { id: "connector", label, ampel: "gelb", detail: "Keine Praxissoftware hinterlegt." };
  }
  if (!result || !result.ok) {
    return {
      id: "connector",
      label,
      ampel: "rot",
      detail:
        result?.reason === "timeout"
          ? "Die Praxissoftware antwortet nicht. Bitte die Betreuungsperson verständigen."
          : "Die Praxissoftware ist nicht erreichbar. Bitte die Betreuungsperson verständigen.",
      technical: result?.reason === "timeout" ? "Connector: Zeitüberschreitung." : "Connector: nicht erreichbar.",
    };
  }
  if (result.ms > 800) {
    return { id: "connector", label, ampel: "gelb", detail: "In Ordnung, aber langsam.", technical: `Connector-Antwort ${result.ms} ms.` };
  }
  return { id: "connector", label, ampel: "gruen", detail: "In Ordnung.", technical: `Connector-Antwort ${result.ms} ms.` };
}

export type DiskInfo = { freeBytes: number; totalBytes: number } | null;

function formatGiB(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** null disk info (statfs unsupported, or Postgres/memory storage) stays gelb, never a false rot. */
export function storageCheck(disk: DiskInfo): ServiceCheck {
  if (!disk || disk.totalBytes <= 0) {
    return { id: "storage", label: "Speicherplatz", ampel: "gelb", detail: "Speicherplatz konnte nicht ermittelt werden." };
  }
  const freePct = (disk.freeBytes / disk.totalBytes) * 100;
  const detail = `${formatGiB(disk.freeBytes)} frei von ${formatGiB(disk.totalBytes)} (${freePct.toFixed(0)} %).`;
  if (freePct < 5) return { id: "storage", label: "Speicherplatz", ampel: "rot", detail };
  if (freePct < 15) return { id: "storage", label: "Speicherplatz", ampel: "gelb", detail };
  return { id: "storage", label: "Speicherplatz", ampel: "gruen", detail };
}

/** Aufbewahrungsfrist ist eine hinterlegte Regel, keine Live-Messung — bleibt informativ grün. */
export function retentionCheck(retentionDays: number): ServiceCheck {
  return {
    id: "retention",
    label: "Aufbewahrungsfrist",
    ampel: "gruen",
    detail: `Anrufe und Protokolle werden nach ${retentionDays} Tagen gelöscht.`,
  };
}

export function buildStatusAggregate(input: {
  ollama: ProbeResult;
  stt: ProbeResult;
  tts: ProbeResult;
  connectorConfigured: boolean;
  connector: ProbeResult | null;
  disk: DiskInfo;
  retentionDays: number;
  now?: Date;
  ttsHost?: string;
  sttHost?: string;
}): StatusAggregate {
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    services: [
      serviceCheckFromProbe("ollama", "Antworten", 11434, input.ollama),
      serviceCheckFromProbe("stt", "Verstehen", 8178, input.stt, input.sttHost),
      serviceCheckFromProbe("tts", "Sprechen", 8179, input.tts, input.ttsHost),
      connectorCheck(input.connectorConfigured, input.connector),
    ],
    storage: storageCheck(input.disk),
    retention: retentionCheck(input.retentionDays),
  };
}

/** Worst ampel across every check — drives the Betriebshandbuch-Hinweis on the page. */
export function worstAmpel(aggregate: StatusAggregate): Ampel {
  const all = [...aggregate.services, aggregate.storage, aggregate.retention];
  if (all.some((c) => c.ampel === "rot")) return "rot";
  if (all.some((c) => c.ampel === "gelb")) return "gelb";
  return "gruen";
}

async function diskInfoFor(dataDir: string | undefined): Promise<DiskInfo> {
  if (!dataDir) return null;
  try {
    // node:fs statfs — Node 18.15+/20, works on Windows and POSIX. Guarded: some sandboxes disallow it.
    const fs = await import("node:fs");
    const stats = fs.statfsSync(dataDir);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    return { freeBytes, totalBytes };
  } catch {
    return null;
  }
}

/** One-word speak against the configured TTS — OpenAI, xAI, or Kokoro. */
export async function probeConfiguredTts(env: Record<string, string | undefined> = process.env): Promise<ProbeResult> {
  const { resolveLlm } = await import("@/lib/alma/llm");
  const cfg = resolveLlm(env);
  if (cfg.ttsKind === "none") return { ok: false, ms: 0, reason: "error" };
  const started = Date.now();
  try {
    const { llmTtsWithMime } = await import("@/lib/alma/llm-runtime");
    const spoken = await llmTtsWithMime("Ja.", "ara", env);
    const ms = Date.now() - started;
    if (!spoken || spoken.buf.byteLength < 80) return { ok: false, ms, reason: "error" };
    return { ok: true, ms };
  } catch {
    return { ok: false, ms: Date.now() - started, reason: "error" };
  }
}

/** Status label for the local voice box (Piper :8179, Whisper :8178) or URL host. */
export function houseVoiceLabel(url: string, kind: "tts" | "stt"): string {
  const raw = String(url ?? "").trim();
  const fallback = kind === "tts" ? "Piper" : "Whisper";
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.port === "8179" || raw.includes(":8179")) return "Piper";
    if (parsed.port === "8178" || raw.includes(":8178")) return "Whisper";
    return parsed.host || fallback;
  } catch {
    return fallback;
  }
}

/** Server function wiring: real network probes + disk stat. Never throws into the route loader. */
export const statusAggregate = createServerFn({ method: "GET" }).handler(async (): Promise<StatusAggregate> => {
  const { requirePractice } = await import("./session.server");
  const session = await requirePractice();
  const { fetchProfile } = await import("./profile-data.server");
  const profile = await fetchProfile(session.practiceId);
  const { hasPraxissoftwareAdapter } = await import("./praxissoftware");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { resolveLlm } = await import("@/lib/alma/llm");
  const { sttModelFromEnv, ttsModelFromEnv } = await import("@/lib/alma/llm-runtime");
  const cfg = resolveLlm(process.env);
  const ttsHost = (() => {
    switch (cfg.ttsKind) {
      case "openai":
        return ttsModelFromEnv();
      case "xai":
        return "xAI TTS";
      case "compat":
        return houseVoiceLabel(cfg.ttsUrl, "tts");
      case "none":
        return "kein TTS";
      default: {
        const _never: never = cfg.ttsKind;
        return _never;
      }
    }
  })();
  const sttHost = (() => {
    switch (cfg.sttKind) {
      case "openai":
        return sttModelFromEnv();
      case "xai":
        return "xAI STT";
      case "compat":
        return houseVoiceLabel(cfg.sttUrl, "stt");
      case "none":
        return "kein STT";
      default: {
        const _never: never = cfg.sttKind;
        return _never;
      }
    }
  })();
  const [ollama, stt, tts] = await Promise.all([
    probeService(cfg.chatUrl.includes("11434") ? cfg.chatUrl : "http://127.0.0.1:11434/"),
    probeService(cfg.sttKind === "none" ? "http://127.0.0.1:8178/" : cfg.sttUrl || "http://127.0.0.1:8178/"),
    probeConfiguredTts(process.env),
  ]);
  const connectorConfigured = Boolean(profile && hasPraxissoftwareAdapter(profile.pms));
  let connector: ProbeResult | null = null;
  if (connectorConfigured) {
    const healthUrl = connectorHealthUrl(String(process.env.SILVIA_PMS_URL ?? ""));
    connector = healthUrl ? await probeService(healthUrl) : { ok: false, ms: 0, reason: "error" };
  }
  const disk = await diskInfoFor(resolvePgliteDataDir());
  return buildStatusAggregate({
    ollama,
    stt,
    tts,
    connectorConfigured,
    connector,
    disk,
    retentionDays: profile?.retentionDays ?? 90,
    ttsHost,
    sttHost,
  });
});
