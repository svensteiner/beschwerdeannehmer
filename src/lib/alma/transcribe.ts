import { createServerFn } from "@tanstack/react-start";
import { normalizeDemoSpeechTerms } from "./demo-speech.ts";
import { speechPracticeId } from "./speech-scope.ts";
import { isStrictTrue } from "./strict-boolean.ts";

/** ~20 s wav/webm as base64, with headroom. */
export const STT_AUDIO_B64_LIMIT = 4_000_000;

export type HoerenOk = { ok: true; text: string };
export type HoerenFail = { ok: false; text: ""; reason: "quiet" | "missing" | "rate" | "empty" | "error" };
export type HoerenResult = HoerenOk | HoerenFail;

/** Nur feste Formatnamen in Betriebszeilen; Client-MIME bleibt unverändert für STT. */
export function sttLogFormat(mime: unknown): "webm" | "wav" | "ogg" | "mpeg" | "unknown" {
  switch (String(mime ?? "").trim().toLowerCase().split(";", 1)[0]) {
    case "audio/webm": return "webm";
    case "audio/wav": return "wav";
    case "audio/ogg": return "ogg";
    case "audio/mpeg": return "mpeg";
    default: return "unknown";
  }
}

/** Inhaltsfreie STT-Betriebszeile für lokal nachvollziehbare Fehler. */
export function sttLogLine(result: "ok" | "leer", bytes: number, mime: unknown, chars: number): string {
  const safeBytes = Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : 0;
  const safeChars = Number.isSafeInteger(chars) && chars >= 0 ? chars : 0;
  return `[stt] ${result} bytes=${safeBytes} format=${sttLogFormat(mime)} zeichen=${safeChars}`;
}

/** Shared STT path for Browser (transcribeAlma) and Gateway (POST /api/stimme/hoeren). */
export async function hoerenAudio(input: {
  audio: string;
  mime?: string;
  ip: string;
  practiceId?: string;
  demoTerms?: string[];
  env?: Record<string, string | undefined>;
}): Promise<HoerenResult> {
  const audio = String(input.audio ?? "");
  if (audio.length > STT_AUDIO_B64_LIMIT)
    return { ok: false, text: "", reason: "error" };
  const mime = String(input.mime ?? "audio/webm").slice(0, 80);
  const env = input.env ?? process.env;
  if (!audio) return { ok: false, text: "", reason: "quiet" };
  const { takeToken } = await import("../practice/rate-limit.ts");
  if (!takeToken(`ai:stt:${input.ip}`, 20, 60_000).allowed) {
    return { ok: false, text: "", reason: "rate" };
  }
  try {
    const raw = Buffer.from(audio, "base64");
    if (raw.byteLength < 200) return { ok: false, text: "", reason: "quiet" };
    const { resolveLlm } = await import("./llm.ts");
    if (resolveLlm(env).sttKind === "none") {
      return { ok: false, text: "", reason: "missing" };
    }
    const { llmStt } = await import("./llm-runtime.ts");
    const text = await llmStt(raw, mime, env, {
      practiceId: input.practiceId,
      demoTerms: input.demoTerms,
    });
    // Betriebszeile ohne Inhalt: nur Ergebnisart, Groesse und Format — damit ein
    // "Silvia hoert nichts" am Praxis-PC im Serverlog erklaerbar ist.
    console.info(sttLogLine(text ? "ok" : "leer", raw.byteLength, mime, text?.length ?? 0));
    if (!text) return { ok: false, text: "", reason: "empty" };
    return { ok: true, text };
  } catch {
    console.error("[stt] fehler=runtime");
    return { ok: false, text: "", reason: "error" };
  }
}

export const transcribeAlma = createServerFn({ method: "POST" })
  .validator((input: { audio: string; mime?: string; line?: string; demo?: boolean; demoTerms?: unknown }) => ({
    demo: isStrictTrue(input?.demo),
    demoTerms:
      isStrictTrue(input?.demo) ? normalizeDemoSpeechTerms(input?.demoTerms) : [],
    audio: String(input?.audio ?? ""),
    mime: String(input?.mime ?? "audio/webm").slice(0, 80),
    line: String(input?.line ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48),
  }))
  .handler(async ({ data }) => {
    const { clientIp, readPracticeSession } = await import("@/lib/practice/session.server");
    const session = await readPracticeSession().catch(() => null);
    let practiceId = speechPracticeId(data.demo, session?.practiceId);
    if (!data.demo && !practiceId && data.line) {
      const { fetchProfileBySlug } = await import("@/lib/practice/profile-data.server");
      practiceId = (await fetchProfileBySlug(data.line))?.id;
    }
    return hoerenAudio({
      audio: data.audio,
      mime: data.mime,
      ip: clientIp(),
      practiceId,
      demoTerms: data.demo ? data.demoTerms : [],
    });
  });
