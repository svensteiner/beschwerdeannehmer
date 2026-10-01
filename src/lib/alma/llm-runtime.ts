import { resolveLlm } from "./llm.ts";
import { normalizeDemoSpeechTerms } from "./demo-speech.ts";
import { TTS_STYLE } from "./speak-text.ts";
import {
  DEFAULT_VOICE,
  type VoiceId,
  voiceSpeed,
  voiceStyle,
} from "./voices.ts";
import { correctNumbers } from "./zahlen.ts";
import { createServerFn } from "@tanstack/react-start";

/** Server-only HTTP to the configured model. Do not import from client components. */

type Env = Record<string, string | undefined>;

const LLM_CHAT_TIMEOUT_MS = 30_000;
const LLM_TTS_TIMEOUT_MS = 30_000;

export type LlmChatOptions = {
  /** Kurze Dialoge brauchen keine lange Modellantwort. */
  maxTokens?: number;
};

function chatTokenLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 420;
  return Math.max(96, Math.min(420, Math.trunc(value ?? 420)));
}

/** Node's environment proxy must never be allowed for model/audio traffic. */
function envProxyActive(env: Env): boolean {
  const sources = [env, process.env];
  return sources.some((source) => {
    const enabled = String(source.NODE_USE_ENV_PROXY ?? "").trim().toLowerCase();
    if (enabled === "1" || enabled === "true") return true;
    return ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
      .some((key) => Boolean(String(source[key] ?? "").trim()));
  });
}

/** Provider input is fail-closed: only exact loopback URLs are permitted. */
export function isAllowedLocalLlmUrl(raw: string): boolean {
  try {
    const url = new URL(String(raw ?? "").trim());
    if (!(["http:", "https:"].includes(url.protocol) && !url.username && !url.password)) return false;
    const host = url.hostname.toLowerCase().replace(/\[|\]/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch { return false; }
}

/**
 * AP 40: konfigurierbares OpenAI-Transkriptionsmodell statt fest verdrahtetem
 * whisper-1 (2026 abgekuendigt). Vorgabe gpt-transcribe — siehe AP 38-Messung
 * in C:\silvia-voice\docs\stt-robustheit.md: WER 0.061 mit deutschem
 * Fach-Prompt gegenueber 0.19 bei whisper-1. In .env.example dokumentiert.
 */
export function sttModelFromEnv(env: Env = process.env): string {
  return String(env.SILVIA_STT_MODEL ?? "").trim() || "gpt-transcribe";
}

/** Whisper-1 bleibt der Notfall-Fallback, falls das konfigurierte Modell scheitert. */
export const STT_FALLBACK_MODEL = "whisper-1";

/**
 * OpenAI-TTS-Modell. Vorgabe gpt-4o-mini-tts (natürlicher Deutsch).
 * Schlägt das Modell fehl, einmaliger Fallback auf tts-1 — analog STT.
 */
export function ttsModelFromEnv(env: Env = process.env): string {
  return String(env.SILVIA_TTS_MODEL ?? "").trim() || "gpt-4o-mini-tts";
}

export const TTS_FALLBACK_MODEL = "tts-1";

/**
 * `instructions` (Stil-Steuerung) wird von den aelteren OpenAI-TTS-Modellen
 * tts-1/tts-1-hd nicht unterstuetzt — nur von gpt-4o-mini-tts & Nachfolgern.
 * Owner-Feedback: Silvia soll schlichter/oesterreichischer klingen (TTS_STYLE).
 */
function openAiSupportsInstructions(model: string): boolean {
  return model !== "tts-1" && model !== "tts-1-hd";
}

/**
 * Deutscher Fach-Prompt, exakt die Liste aus C:\silvia-voice\tests\stt\wer-modelle.py
 * (FACH_PROMPT), mit der AP 38 die gemessene Verbesserung (0.078 -> 0.061 WER bei
 * gpt-transcribe) erzielt hat. Nur diese Liste uebernehmen, nicht erweitern — sonst
 * gilt die Messung nicht mehr. „Doktor Huber“ bleibt deshalb in der Produktionsliste
 * (Messung ≠ Demo-Pfad); Live-Begrüßung kommt aus greetingFor(desk), nicht aus dem Prompt.
 */
export const STT_FACH_PROMPT =
  "Ordination, Tierarzt, Impfung, Kastration, Notfall, Termin, Rezept, " +
  "Hund, Katze, Kaninchen, Pferd, Papagei, Labrador, Meerschweinchen, " +
  "Grüß Gott, Uhr, Doktor Huber";

/**
 * AP 57: Hoer-Check im Training — vom Operator bestaetigte Korrekturen werden
 * Vokabular-Hinweise fuer die naechste Erkennung. Haengt bis zu 20 zuletzt
 * korrigierte, distinkte, kurze (<=40 Zeichen) Phrasen an den Fach-Prompt an.
 * Pure Funktion, kein IO — der Aufrufer (llmStt) liest die Korrekturen.
 */
export function sttPromptWithCorrections(base: string, corrections: string[]): string {
  const seen = new Set<string>();
  const extra: string[] = [];
  for (let i = corrections.length - 1; i >= 0 && extra.length < 20; i--) {
    const c = String(corrections[i] ?? "").trim();
    if (!c || c.length > 40) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(c);
  }
  if (!extra.length) return base;
  return `${base}, ${extra.join(", ")}`;
}

/**
 * xAI-TTS: Owner-Wunsch, die Stimme "in eine oesterreichische Richtung zu
 * lenken" (siehe Aufgabenstellung). xAI dokumentiert `language` als
 * BCP-47-Code (docs.x.ai, Abschnitt "Supported Languages", Stand 2026-09) —
 * die offizielle Liste fuehrt Deutsch nur als "de", kein "de-AT". Ein
 * echter Probe-Request auf dieser Maschine konnte NICHT bestaetigen, ob
 * "de-AT" akzeptiert wird: .env enthaelt nur den Platzhalter
 * "dein_xai_schluessel" statt eines echten Schluessels, beide Probe-Calls
 * scheiterten an der Authentifizierung (HTTP 400 "Incorrect API key
 * provided"), bevor xAI die Sprache ueberhaupt prueft. Deshalb hier per
 * Versuch + Fallback abgesichert: schlaegt "de-AT" mit 4xx fehl, faellt
 * ttsProviderResponse einmalig auf das dokumentierte "de" zurueck. Vor
 * Produktivbetrieb mit einem echten Schluessel erneut pruefen.
 */
export const TTS_LANGUAGE_AT = "de-AT";
export const TTS_LANGUAGE_FALLBACK = "de";
/** Gemerkte xAI-Sprache: startet mit de-AT, faellt nach einer 4xx-Ablehnung dauerhaft auf "de". */
let xaiTtsLanguage: string = TTS_LANGUAGE_AT;
/** Nur fuer Tests: Sprachwahl zuruecksetzen. */
export function resetXaiTtsLanguage() {
  xaiTtsLanguage = TTS_LANGUAGE_AT;
}

/** Owner-Feedback: Stimmen zu aehnlich. Vier verschiedene OpenAI-Stimmen, keine Duplikate. */
export const OPENAI_TTS_VOICE: Record<VoiceId, string> = {
  ara: "marin",
  carina: "shimmer",
  liora: "alloy",
  luna: "sage",
};

/** Kokoro-FastAPI / OpenAI-compat. Override all with SILVIA_TTS_VOICE. */
export const COMPAT_TTS_VOICE: Record<VoiceId, string> = {
  ara: "af_bella",
  carina: "af_nicole",
  liora: "af_sarah",
  luna: "af_sky",
};

export function compatTtsVoice(voice: VoiceId, env: Env = process.env): string {
  const forced = String(env.SILVIA_TTS_VOICE ?? "").trim();
  if (forced) return forced;
  return COMPAT_TTS_VOICE[voice];
}

export async function llmChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  env: Env = process.env,
  options: LlmChatOptions = {},
): Promise<string | null> {
  const llm = resolveLlm(env);
  if (envProxyActive(env)) return null;
  if (!llm.chatUrl || (llm.id !== "compat" && llm.id !== "local" && !llm.apiKey)) return null;
  if (llm.thirdParty || !isAllowedLocalLlmUrl(llm.chatUrl)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(llm.chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: llm.chatModel,
        max_tokens: chatTokenLimit(options.maxTokens),
        // AP 28: niedrigere Temperatur nur fuer compat/lokale Modelle (Eval-Stabilitaet,
        // weniger Sampling-Varianz bei qwen2.5/gemma3 via Ollama-compat-Endpoint).
        // OpenAI/xai-Pfad bewusst unveraendert bei 0.4 gelassen.
        temperature: llm.id === "compat" || llm.id === "local" ? 0.15 : 0.4,
        messages,
      }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    // Netzwerk-, Redirect- und JSON-Fehler dürfen den Gesprächsweg nie brechen.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** MIME type inferred from an audio Content-Type header, defaulting to mp3. */
function mimeFromContentType(contentType: string | null): string {
  const ct = String(contentType ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  return ct || "audio/mpeg";
}

type TtsResponse = { res: Response; mime: string };

/** Provider Response with a live body — Gateway can pipe it, Browser still buffers. */
async function ttsProviderResponse(
  text: string,
  voice: VoiceId,
  env: Env,
  signal?: AbortSignal,
): Promise<TtsResponse | null> {
  const llm = resolveLlm(env);
  if (envProxyActive(env)) return null;
  if (llm.ttsKind === "none" || !llm.ttsUrl || !text) return null;
  if (llm.thirdParty || !isAllowedLocalLlmUrl(llm.ttsUrl)) return null;
  if (llm.ttsKind !== "compat" && !llm.apiKey) return null;
  if (llm.ttsKind === "openai") {
    const model = ttsModelFromEnv(env);
    const spokenVoice = OPENAI_TTS_VOICE[voice] || "nova";
    // Owner-Feedback: Stimmen zu aehnlich — je Stimme eine eigene
    // Stil-Regieanweisung zusaetzlich zum allgemeinen TTS_STYLE.
    const instructions = `${TTS_STYLE} ${voiceStyle(voice)}`.trim();
    let res = await fetchOpenAiTts(
      llm.ttsUrl,
      llm.apiKey,
      text,
      openAiSupportsInstructions(model) ? spokenVoice : (spokenVoice === "marin" ? "coral" : spokenVoice),
      model,
      instructions,
      signal,
    );
    if (!signal?.aborted && (!res || !res.ok) && model !== TTS_FALLBACK_MODEL) {
      logTtsFallback(model, TTS_FALLBACK_MODEL);
      res = await fetchOpenAiTts(
        llm.ttsUrl,
        llm.apiKey,
        text,
        spokenVoice === "marin" ? "coral" : spokenVoice,
        TTS_FALLBACK_MODEL,
        instructions,
        signal,
      );
    }
    if (!res || !res.ok || !res.body) return null;
    return {
      res,
      mime:
        mimeFromContentType(res.headers.get("content-type")) || "audio/mpeg",
    };
  }
  if (llm.ttsKind === "compat") {
    const res = await fetchCompatTts(llm.ttsUrl, llm.apiKey, text, voice, env, signal);
    if (!res || !res.ok || !res.body) return null;
    return {
      res,
      mime: mimeFromContentType(res.headers.get("content-type")) || "audio/wav",
    };
  }
  let res = await fetchXaiTts(
    llm.ttsUrl,
    llm.apiKey,
    text,
    voice,
    xaiTtsLanguage,
    signal,
  );
  // "de-AT" ist nicht in xAI's dokumentierter Sprachliste — bei Ablehnung
  // (4xx) auf das dokumentierte "de" zurueckfallen und das fuer den Prozess
  // merken, damit nicht jeder Anruf einen Extra-Roundtrip zahlt.
  if (
    !signal?.aborted &&
    res &&
    !res.ok &&
    res.status >= 400 &&
    res.status < 500 &&
    xaiTtsLanguage !== TTS_LANGUAGE_FALLBACK
  ) {
    logTtsLanguageFallback(xaiTtsLanguage, TTS_LANGUAGE_FALLBACK);
    xaiTtsLanguage = TTS_LANGUAGE_FALLBACK;
    res = await fetchXaiTts(
      llm.ttsUrl,
      llm.apiKey,
      text,
      voice,
      TTS_LANGUAGE_FALLBACK,
      signal,
    );
  }
  if (!res || !res.ok || !res.body) return null;
  return {
    res,
    mime: mimeFromContentType(res.headers.get("content-type")) || "audio/mpeg",
  };
}

/** Live audio bytes from the provider. Do not buffer before returning. */
export async function llmTtsStream(
  text: string,
  voice: VoiceId = DEFAULT_VOICE,
  env: Env = process.env,
): Promise<{ stream: ReadableStream<Uint8Array>; mime: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TTS_TIMEOUT_MS);
  const spoken = await ttsProviderResponse(text, voice, env, controller.signal);
  if (!spoken?.res.body) {
    clearTimeout(timeout);
    return null;
  }
  if (controller.signal.aborted) {
    await spoken.res.body.cancel().catch(() => undefined);
    clearTimeout(timeout);
    return null;
  }
  const reader = spoken.res.body.getReader();
  let finished = false;
  let timedOut = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  function cleanup() {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", onAbort);
  }
  const onAbort = () => {
    timedOut = true;
    cleanup();
    void reader.cancel("tts-timeout").catch(() => undefined);
    streamController?.error(new DOMException("TTS timeout", "AbortError"));
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const stream = new ReadableStream<Uint8Array>({
    start(sink) {
      streamController = sink;
    },
    async pull(sink) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (timedOut) {
            sink.error(new DOMException("TTS timeout", "AbortError"));
            return;
          }
          cleanup();
          sink.close();
        } else {
          sink.enqueue(chunk.value);
        }
      } catch {
        cleanup();
        sink.error(timedOut ? new DOMException("TTS timeout", "AbortError") : undefined);
      }
    },
    async cancel(reason) {
      cleanup();
      controller.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
  return { stream, mime: spoken.mime };
}

/**
 * Speaks `text` with the configured provider. Returns the audio bytes and
 * the real MIME type (compat servers may answer wav, not mp3).
 */
export async function llmTtsWithMime(
  text: string,
  voice: VoiceId = DEFAULT_VOICE,
  env: Env = process.env,
): Promise<{ buf: Buffer; mime: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TTS_TIMEOUT_MS);
  try {
    const spoken = await ttsProviderResponse(text, voice, env, controller.signal);
    if (!spoken) return null;
    const buf = Buffer.from(await spoken.res.arrayBuffer());
    return buf.byteLength < 80 ? null : { buf, mime: spoken.mime };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function llmTts(
  text: string,
  voice: VoiceId = DEFAULT_VOICE,
  env: Env = process.env,
): Promise<Buffer | null> {
  const result = await llmTtsWithMime(text, voice, env);
  return result?.buf ?? null;
}

/** newer models (e.g. gpt-transcribe) reject a filename extension that mismatches the MIME type. */
function sttFilename(mime: string): string {
  const ct = String(mime ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  if (ct === "audio/wav" || ct === "audio/x-wav" || ct === "audio/wave")
    return "clip.wav";
  if (ct === "audio/mpeg" || ct === "audio/mp3") return "clip.mp3";
  if (ct === "audio/ogg") return "clip.ogg";
  if (ct === "audio/mp4") return "clip.mp4";
  if (ct === "audio/x-m4a" || ct === "audio/m4a") return "clip.m4a";
  return "clip.webm";
}

function sttMimeBase(mime: string): string {
  return String(mime ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase() || "audio/webm";
}

function sttForm(
  audio: Buffer,
  mime: string,
  model?: string,
  prompt?: string,
): FormData {
  const form = new FormData();
  const effectiveMime = sttMimeBase(mime);
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: effectiveMime }),
    sttFilename(effectiveMime),
  );
  form.append("language", "de");
  if (model) form.append("model", model);
  if (prompt) form.append("prompt", prompt);
  return form;
}

async function fetchStt(
  sttUrl: string,
  apiKey: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<Response | null> {
  if (signal?.aborted || !isAllowedLocalLlmUrl(sttUrl)) return null;
  try {
    return await fetch(sttUrl, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: form,
      redirect: "error",
      signal,
    });
  } catch {
    return null;
  }
}

/** Server-side only, no personal data (audio/transcript never logged) — governance/AP 40. */
function logSttFallback(failedModel: string, fallbackModel: string) {
  console.warn(
    `[silvia][stt] Modell "${failedModel}" fehlgeschlagen — einmaliger Fallback auf "${fallbackModel}".`,
  );
}

function logTtsFallback(failedModel: string, fallbackModel: string) {
  console.warn(
    `[silvia][tts] Modell "${failedModel}" fehlgeschlagen — einmaliger Fallback auf "${fallbackModel}".`,
  );
}

/** Server-side only — kein personenbezogener Text im Log, nur die Sprachcodes. */
function logTtsLanguageFallback(
  failedLanguage: string,
  fallbackLanguage: string,
) {
  console.warn(
    `[silvia][tts] xAI-Sprache "${failedLanguage}" abgelehnt — einmaliger Fallback auf "${fallbackLanguage}".`,
  );
}

async function fetchOpenAiTts(
  url: string,
  apiKey: string,
  text: string,
  voice: string,
  model: string,
  instructions: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  if (!isAllowedLocalLlmUrl(url)) return null;
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        // mp3 bleibt: der Versuch mit wav (2026-09-10) liess das Audio-Element im Browser
        // nie "ended" melden — Silvia blieb bei "spricht …" haengen und hoerte nicht weiter.
        // Klangverbesserung kommt ueber die Regieanweisung (TTS_STYLE), nicht ueber das Format.
        response_format: "mp3",
        ...(openAiSupportsInstructions(model) ? { instructions } : {}),
      }),
      redirect: "error",
      signal,
    });
  } catch {
    return null;
  }
}

async function fetchCompatTts(
  url: string,
  apiKey: string,
  text: string,
  voice: VoiceId,
  env: Env,
  signal?: AbortSignal,
): Promise<Response | null> {
  if (!isAllowedLocalLlmUrl(url)) return null;
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: "local",
        input: text,
        voice: compatTtsVoice(voice, env),
        response_format: "wav",
        speed: voiceSpeed(voice),
      }),
      redirect: "error",
      signal,
    });
  } catch {
    return null;
  }
}

async function fetchXaiTts(
  url: string,
  apiKey: string,
  text: string,
  voice: VoiceId,
  language: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  if (!isAllowedLocalLlmUrl(url)) return null;
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        language,
        speed: voiceSpeed(voice),
      }),
      redirect: "error",
      signal,
    });
  } catch {
    return null;
  }
}

async function readSttText(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as {
      text?: string;
      transcript?: string;
      transcription?: string;
    };
    const text = (
      body.text ??
      body.transcript ??
      body.transcription ??
      ""
    ).trim();
    return text || null;
  } catch {
    return null;
  }
}

const cachedCorrections = new Map<string, { at: number; phrases: string[] }>();
const CORRECTIONS_CACHE_MS = 60_000;

/** Server boundary: tenant identity is taken from the authenticated session. */
const loadPersistedCorrections = createServerFn({ method: "GET" }).handler(async () => {
  const { readPracticeSession } = await import("@/lib/practice/session.server");
  const practiceId = (await readPracticeSession().catch(() => null))?.practiceId;
  if (!practiceId) return [];
  const { readRecentHoerKorrekturen } = await import("./llm-runtime.server.ts");
  return readRecentHoerKorrekturen(practiceId);
});

/** Eine eben bestätigte Korrektur soll schon beim nächsten Satz helfen. */
export function clearSttCorrectionCache(practiceId?: string) {
  if (practiceId) cachedCorrections.delete(practiceId);
  else cachedCorrections.clear();
}

/**
 * AP 57: liest die zuletzt bestaetigten Hoer-Korrekturen fuer den STT-Prompt.
 * Lazy (nur bei Bedarf), 60s gecacht, wirft nie — ein fehlender/kaputter Log
 * darf die Transkription nicht behindern.
 */
async function recentHoerKorrekturen(practiceId?: string): Promise<string[]> {
  if (!practiceId) return [];
  const now = Date.now();
  const cached = cachedCorrections.get(practiceId);
  if (cached && now - cached.at < CORRECTIONS_CACHE_MS) {
    return cached.phrases;
  }
  try {
    // The DB/PGlite bridge runs only inside the authenticated server handler.
    const phrases = await loadPersistedCorrections();
    cachedCorrections.set(practiceId, { at: now, phrases });
    return phrases;
  } catch {
    cachedCorrections.set(practiceId, { at: now, phrases: [] });
    return [];
  }
}

export async function llmStt(
  audio: Buffer,
  mime: string,
  env: Env = process.env,
  options: {
    practiceId?: string;
    demoTerms?: string[];
    correctionReader?: (practiceId: string) => Promise<string[]>;
  } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await llmSttInternal(audio, mime, env, options, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function llmSttInternal(
  audio: Buffer,
  mime: string,
  env: Env = process.env,
  options: {
    practiceId?: string;
    demoTerms?: string[];
    /** Test seam: production uses the persisted practice corrections by default. */
    correctionReader?: (practiceId: string) => Promise<string[]>;
  } = {},
  signal?: AbortSignal,
): Promise<string | null> {
  const llm = resolveLlm(env);
  if (envProxyActive(env)) return null;
  if (llm.sttKind === "none" || !llm.sttUrl || audio.byteLength < 200)
    return null;
  if (llm.thirdParty || !isAllowedLocalLlmUrl(llm.sttUrl)) return null;
  if (llm.sttKind !== "compat" && !llm.apiKey) return null;

  if (llm.sttKind === "openai") {
    const model = sttModelFromEnv(env);
    const corrections = options.practiceId && options.correctionReader
      ? await options.correctionReader(options.practiceId)
      : await recentHoerKorrekturen(options.practiceId);
    const demoTerms = options.practiceId
      ? []
      : normalizeDemoSpeechTerms(options.demoTerms);
    const prompt = sttPromptWithCorrections(STT_FACH_PROMPT, [
      ...corrections,
      ...demoTerms,
    ]);
    let res = await fetchStt(
      llm.sttUrl,
      llm.apiKey,
      sttForm(audio, mime, model, prompt), signal,
    );
    // Manche Modelle unterstuetzen `prompt` nicht und lehnen die Anfrage ab —
    // dann einmal ohne Prompt erneut versuchen statt zu scheitern.
    if (!res || !res.ok) {
      const retry = await fetchStt(
        llm.sttUrl,
        llm.apiKey,
        sttForm(audio, mime, model), signal,
      );
      if (retry && retry.ok) res = retry;
    }
    // Konfiguriertes Modell abgekuendigt/nicht freigeschaltet: einmalig auf
    // whisper-1 zurueckfallen, serverseitig ohne personenbezogene Daten loggen.
    if ((!res || !res.ok) && model !== STT_FALLBACK_MODEL) {
      logSttFallback(model, STT_FALLBACK_MODEL);
      res = await fetchStt(
        llm.sttUrl,
        llm.apiKey,
        sttForm(audio, mime, STT_FALLBACK_MODEL), signal,
      );
    }
    if (!res || !res.ok) return null;
    const text = await readSttText(res);
    return text ? correctNumbers(text) : null;
  }

  if (llm.sttKind === "compat") {
    const corrections = options.practiceId && options.correctionReader
      ? await options.correctionReader(options.practiceId)
      : await recentHoerKorrekturen(options.practiceId);
    const demoTerms = options.practiceId
      ? []
      : normalizeDemoSpeechTerms(options.demoTerms);
    const prompt = sttPromptWithCorrections(STT_FACH_PROMPT, [
      ...corrections,
      ...demoTerms,
    ]);
    const form = sttForm(audio, mime, undefined, prompt);
    form.append("response_format", "json");
    let res = await fetchStt(llm.sttUrl, llm.apiKey, form, signal);
    // Eigene Whisper-Server sind OpenAI-kompatibel, unterstuetzen den optionalen
    // Prompt aber nicht immer. Dann bleibt die Erkennung nutzbar und versucht
    // es einmal ohne Sprachtrainings-Hinweis erneut.
    if (!res || !res.ok) {
      const retry = sttForm(audio, mime);
      retry.append("response_format", "json");
      res = await fetchStt(llm.sttUrl, llm.apiKey, retry, signal);
    }
    if (!res || !res.ok) return null;
    const text = await readSttText(res);
    return text ? correctNumbers(text) : null;
  }

  const form = sttForm(audio, mime);
  const res = await fetchStt(llm.sttUrl, llm.apiKey, form, signal);
  if (!res || !res.ok) return null;
  const text = await readSttText(res);
  return text ? correctNumbers(text) : null;
}
