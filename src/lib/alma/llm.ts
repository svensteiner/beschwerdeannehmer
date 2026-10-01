import type { Patient } from "./patients.ts";
import { redactForCloud } from "@/lib/live/redact";
import { hasPracticeKbNeedles, patientMatchesCallNeedles, practiceKbNeedles } from "../practice/practice-kb.ts";

/** How many matching Akten may leave the Ordination toward a model. */
export const LLM_EXCERPT_LIMIT = 8;

export type LlmProviderId = "openai" | "xai" | "compat" | "local";

export type LlmConfig = {
  id: LlmProviderId;
  chatUrl: string;
  chatModel: string;
  apiKey: string;
  ttsKind: "openai" | "xai" | "compat" | "none";
  sttKind: "openai" | "xai" | "compat" | "none";
  ttsUrl: string;
  sttUrl: string;
  /** Vendor host sees the prompt. Own server and in-process local do not. */
  thirdParty: boolean;
};

export type LlmStatus = {
  id: LlmProviderId;
  thirdParty: boolean;
  label: string;
  hint: string;
  missingKey: boolean;
};

export const SETTINGS_LLM_HINT_ID = "settings-llm-hint";

type Env = Record<string, string | undefined>;
type RequestedLlmProvider = LlmProviderId | "auto";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TTS = "https://api.openai.com/v1/audio/speech";
const OPENAI_STT = "https://api.openai.com/v1/audio/transcriptions";
const XAI_CHAT = "https://api.x.ai/v1/chat/completions";
const XAI_TTS = "https://api.x.ai/v1/tts";
const XAI_STT = "https://api.x.ai/v1/stt";

/** Local is the safe default. `auto` remains an explicit legacy opt-in only. */
function selectedLlmProvider(env: Env): RequestedLlmProvider {
  const raw = String(env.SILVIA_LLM_PROVIDER ?? "local").trim().toLowerCase();
  return raw === "local" || raw === "compat" || raw === "openai" || raw === "xai" || raw === "auto"
    ? raw
    : "local";
}

function serverSecret(env: Env, name: string) {
  if (!name || name.startsWith("VITE_")) return "";
  return String(env[name] ?? "").trim();
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  return `${trimSlash(base)}/${String(path).replace(/^\/+/, "")}`;
}

export function llmHostIsThirdParty(url: string) {
  try {
    // WHATWG keeps IPv6 hostnames bracketed (`[::1]`), unlike IPv4 names.
    // Normalize that representation before evaluating the local trust boundary.
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    // Any non-private host is outside the machine/LAN trust boundary. This
    // matters for compat providers too: an arbitrary public URL must trigger
    // the same practice-data redaction as OpenAI/xAI.
    return true;
  } catch {
    return false;
  }
}

/** Sprachdienste im Lokalmodus dürfen ausschließlich auf diesem Rechner liegen. */
function localVoiceUrl(raw: unknown, defaultPath: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\[|\]/g, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !["localhost", "127.0.0.1", "::1"].includes(host)
    ) {
      return "";
    }
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = defaultPath;
      return url.toString();
    }
    return value;
  } catch {
    return "";
  }
}

/** Chat-LLM im lokalen Modus darf ausschließlich auf Loopback laufen. */
function localLlmUrl(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value || !isLoopbackHttpUrl(value)) return "";
  return joinUrl(trimSlash(value), "chat/completions");
}

function isLoopbackHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replaceAll("[", "").replaceAll("]", "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      ["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

/**
 * Single model switch. Local is the default; cloud selection requires an
 * explicit provider value. Keys are server env only — never `VITE_`.
 */
export function resolveLlm(env: Env = process.env): LlmConfig {
  const forced = selectedLlmProvider(env);
  const openaiKey = serverSecret(env, "OPENAI_API_KEY");
  const xaiKey = serverSecret(env, "XAI_API_KEY");
  const base = trimSlash(String(env.SILVIA_LLM_BASE_URL ?? "").trim());
  const model = String(env.SILVIA_LLM_MODEL ?? "").trim();

  if (forced === "local") return localConfig(env);

  if (forced === "compat" || (forced === "auto" && base)) {
    const sttUrl = String(env.SILVIA_STT_URL ?? "").trim();
    const ttsUrl = String(env.SILVIA_TTS_URL ?? "").trim();
    return {
      id: "compat",
      chatUrl: joinUrl(base || "http://127.0.0.1:11434/v1", "chat/completions"),
      chatModel: model || "llama",
      apiKey: openaiKey || xaiKey,
      ttsKind: ttsUrl ? "compat" : "none",
      sttKind: sttUrl ? "compat" : "none",
      ttsUrl,
      sttUrl,
      thirdParty: llmHostIsThirdParty(base) || (sttUrl ? llmHostIsThirdParty(sttUrl) : false) || (ttsUrl ? llmHostIsThirdParty(ttsUrl) : false),
    };
  }

  if (forced === "openai" || (forced === "auto" && openaiKey)) {
    // Mixed-mode voice override: chat can stay on OpenAI while STT/TTS point
    // at a local/compat service. Default ("auto") keeps the historic
    // behavior (voice follows chat to OpenAI) for backward compatibility.
    const ttsMode = String(env.SILVIA_TTS_PROVIDER ?? "auto").trim().toLowerCase();
    const sttMode = String(env.SILVIA_STT_PROVIDER ?? "auto").trim().toLowerCase();
    const compatTtsUrl = String(env.SILVIA_TTS_URL ?? "").trim();
    const compatSttUrl = String(env.SILVIA_STT_URL ?? "").trim();

    let ttsKind: LlmConfig["ttsKind"] = openaiKey ? "openai" : "none";
    let ttsUrl = OPENAI_TTS;
    if (ttsMode === "none") {
      ttsKind = "none";
      ttsUrl = "";
    } else if (ttsMode === "compat" && compatTtsUrl) {
      ttsKind = "compat";
      ttsUrl = compatTtsUrl;
    } else if (ttsMode === "openai") {
      ttsKind = openaiKey ? "openai" : "none";
      ttsUrl = OPENAI_TTS;
    }

    let sttKind: LlmConfig["sttKind"] = openaiKey ? "openai" : "none";
    let sttUrl = OPENAI_STT;
    if (sttMode === "none") {
      sttKind = "none";
      sttUrl = "";
    } else if (sttMode === "compat" && compatSttUrl) {
      sttKind = "compat";
      sttUrl = compatSttUrl;
    } else if (sttMode === "openai") {
      sttKind = openaiKey ? "openai" : "none";
      sttUrl = OPENAI_STT;
    }

    return {
      id: "openai",
      chatUrl: OPENAI_CHAT,
      chatModel: model || "gpt-4o-mini",
      apiKey: openaiKey,
      ttsKind,
      sttKind,
      ttsUrl,
      sttUrl,
      // Chat always talks to OpenAI in this branch, so thirdParty stays true
      // regardless of a compat/local STT or TTS override above.
      thirdParty: true,
    };
  }

  if (forced === "xai" || (forced === "auto" && xaiKey)) {
    return {
      id: "xai",
      chatUrl: XAI_CHAT,
      chatModel: model || "grok-4.5",
      apiKey: xaiKey,
      ttsKind: xaiKey ? "xai" : "none",
      sttKind: xaiKey ? "xai" : "none",
      ttsUrl: XAI_TTS,
      sttUrl: XAI_STT,
      thirdParty: true,
    };
  }

  return localConfig(env);
}

function localConfig(env: Env): LlmConfig {
  const chatUrl = localLlmUrl(env.SILVIA_LLM_BASE_URL);
  const model = String(env.SILVIA_LLM_MODEL ?? "").trim();
  const sttUrl = localVoiceUrl(env.SILVIA_STT_URL, "/v1/audio/transcriptions");
  const ttsUrl = localVoiceUrl(env.SILVIA_TTS_URL, "/v1/audio/speech");
  return {
    id: "local",
    chatUrl,
    chatModel: model || "llama3.2",
    apiKey: "",
    ttsKind: ttsUrl ? "compat" : "none",
    sttKind: sttUrl ? "compat" : "none",
    ttsUrl,
    sttUrl,
    thirdParty: false,
  };
}

/** True when an explicitly selected cloud provider lacks its server key. */
export function llmMissingCloudKey(env: Env = process.env): boolean {
  const forced = selectedLlmProvider(env);
  if (forced === "local") return false;
  const base = trimSlash(String(env.SILVIA_LLM_BASE_URL ?? "").trim());
  if (forced === "compat" || (forced === "auto" && base)) return false;
  const openaiKey = serverSecret(env, "OPENAI_API_KEY");
  const xaiKey = serverSecret(env, "XAI_API_KEY");
  if (forced === "openai") return !openaiKey;
  if (forced === "xai") return !xaiKey;
  return !openaiKey && !xaiKey;
}

export function llmStatusHint(status: { id: LlmProviderId; missingKey: boolean }): string {
  if (status.missingKey) {
    return "Externe KI für Praxisdaten gesperrt. Lokale Verarbeitung einrichten.";
  }
  if (status.id === "local") {
    return "Lokal (SILVIA_LLM_PROVIDER=local): lokale Regeln ohne Antwortmodell.";
  }
  if (status.id === "compat") {
    return "Eigener Server konfiguriert. Betriebsbereitschaft noch nicht abgenommen.";
  }
  return "Externe KI für Praxisdaten gesperrt. Lokale Verarbeitung einrichten.";
}

export function llmStatusView(env: Env = process.env): LlmStatus {
  const llm = resolveLlm(env);
  const missingKey = llmMissingCloudKey(env);
  const label = missingKey
    ? "Lokal, ohne Cloud-Modell"
    : llm.id === "openai"
      ? "OpenAI konfiguriert — für Praxisdaten gesperrt"
      : llm.id === "xai"
        ? "xAI konfiguriert — für Praxisdaten gesperrt"
        : llm.id === "compat"
          ? "Eigener Server konfiguriert — noch nicht abgenommen"
          : "Lokal, ohne Cloud-Modell";
  return {
    id: llm.id,
    thirdParty: llm.thirdParty,
    label,
    missingKey,
    hint: llmStatusHint({ id: llm.id, missingKey }),
  };
}

/** Named / Chip / Handy hits only. No recent-Kartei dump. */
export function aclPatientExcerpt<T extends { name: string; owner: string; chip: string; phone: string }>(
  rows: T[],
  spoken: string,
  limit = LLM_EXCERPT_LIMIT,
): T[] {
  const n = practiceKbNeedles(spoken);
  if (!hasPracticeKbNeedles(n)) return [];
  const hits: T[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!patientMatchesCallNeedles(row, n)) continue;
    const key = `${row.chip}|${row.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(row);
    if (hits.length >= limit) break;
  }
  return hits;
}

export function redactStoredContact(raw: string) {
  return redactForCloud(String(raw ?? "")).text
    .replace(/\[E-Mail\]/g, "E-Mail hinterlegt")
    .replace(/\[Nummer\]/g, "Nummer hinterlegt")
    .replace(/\[IBAN\]/g, "IBAN hinterlegt")
    .replace(/\[Chip\]/g, "Chip hinterlegt")
    .replace(/(?:\+?43|00\s*43|0)\s*\d[\d\s/-]{5,}/g, "Nummer hinterlegt");
}

export function redactPatientExcerpt(row: Patient): Patient {
  return {
    ...row,
    phone: "",
    chip: "",
    notes: redactStoredContact(row.notes),
    warnings: row.warnings ? redactStoredContact(row.warnings) : undefined,
    lastCallNote: row.lastCallNote ? redactStoredContact(row.lastCallNote) : undefined,
  };
}

/** What the model may see. Third-party vendors never get stored Handy/Chip/E-Mail. */
export function llmPatientPrompt(rows: Patient[], thirdParty: boolean): Patient[] {
  const capped = rows.slice(0, LLM_EXCERPT_LIMIT);
  return thirdParty ? capped.map(redactPatientExcerpt) : capped;
}
