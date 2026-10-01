import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_VOICE, isVoiceId, type VoiceId } from "./voices.ts";
import { SPEAK_TEXT_LIMIT, forSpeech, speakNextChunk } from "./speak-text.ts";

/** Browsergrenze zusätzlich zum serverseitigen TTS-Timeout. */
export const TTS_CLIENT_TIMEOUT_MS = 35_000;

export {
  GREETING,
  SIGNATURE,
  SILVIA_LANG,
  SPEAK_TEXT_LIMIT,
  SPEECH_CHUNK_MIN,
  TTS_FAIL_TOAST_ID,
  TTS_STYLE,
  VOICE_SAMPLES,
  forSpeech,
  speakZip,
  speakNextChunk,
  speechChunks,
  ttsFailToast,
  voiceSampleAt,
} from "./speak-text.ts";

export type SprechenOk = {
  ok: true;
  audio: string;
  mime: string;
  rest?: string;
};
export type SprechenFail = {
  ok: false;
  reason: "empty" | "rate" | "missing" | "error";
};
export type SprechenResult = SprechenOk | SprechenFail;
export type SprechenStreamOk = {
  ok: true;
  stream: ReadableStream<Uint8Array>;
  mime: string;
  rest?: string;
};
export type SprechenStreamResult = SprechenStreamOk | SprechenFail;

function sprechenSpoken(
  text: string,
  saetze: boolean,
): { speak: string; rest: string } {
  if (saetze) return speakNextChunk(text);
  return { speak: forSpeech(text).slice(0, SPEAK_TEXT_LIMIT), rest: "" };
}

/** Shared TTS path for Browser (speakAlma) and Gateway (POST /api/stimme/sprechen). */
export async function sprechenText(input: {
  text: string;
  voice?: string;
  ip: string;
  saetze?: boolean;
}): Promise<SprechenResult> {
  const { speak, rest } = sprechenSpoken(
    String(input.text ?? ""),
    Boolean(input.saetze),
  );
  if (!speak) return { ok: false, reason: "empty" };
  const voice = isVoiceId(String(input.voice ?? ""))
    ? (input.voice as VoiceId)
    : DEFAULT_VOICE;
  const { takeToken } = await import("../practice/rate-limit.ts");
  if (!takeToken(`ai:tts:${input.ip}`, 30, 60_000).allowed)
    return { ok: false, reason: "rate" };
  try {
    const { resolveLlm } = await import("./llm.ts");
    if (resolveLlm().ttsKind === "none")
      return { ok: false, reason: "missing" };
    const { llmTtsWithMime } = await import("./llm-runtime.ts");
    const result = await llmTtsWithMime(speak, voice);
    if (!result) return { ok: false, reason: "error" };
    return {
      ok: true,
      mime: result.mime,
      audio: `data:${result.mime};base64,${result.buf.toString("base64")}`,
      ...(rest ? { rest } : {}),
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Same guards as sprechenText, but the provider body is piped — no base64 wait. */
export async function sprechenStream(input: {
  text: string;
  voice?: string;
  ip: string;
  saetze?: boolean;
}): Promise<SprechenStreamResult> {
  const { speak, rest } = sprechenSpoken(
    String(input.text ?? ""),
    Boolean(input.saetze),
  );
  if (!speak) return { ok: false, reason: "empty" };
  const voice = isVoiceId(String(input.voice ?? ""))
    ? (input.voice as VoiceId)
    : DEFAULT_VOICE;
  const { takeToken } = await import("../practice/rate-limit.ts");
  if (!takeToken(`ai:tts:${input.ip}`, 30, 60_000).allowed)
    return { ok: false, reason: "rate" };
  try {
    const { resolveLlm } = await import("./llm.ts");
    if (resolveLlm().ttsKind === "none")
      return { ok: false, reason: "missing" };
    const { llmTtsStream } = await import("./llm-runtime.ts");
    const result = await llmTtsStream(speak, voice);
    if (!result) return { ok: false, reason: "error" };
    return {
      ok: true,
      stream: result.stream,
      mime: result.mime,
      ...(rest ? { rest } : {}),
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export const speakAlma = createServerFn({ method: "POST" })
  .validator((input: { text: string; voice?: string }) => ({
    text: String(input?.text ?? ""),
    voice: String(input?.voice ?? ""),
  }))
  .handler(async ({ data }) => {
    const { clientIp } = await import("@/lib/practice/session.server");
    const result = await sprechenText({
      text: data.text,
      voice: data.voice,
      ip: clientIp(),
    });
    if (!result.ok) return { ok: false as const };
    return { ok: true as const, audio: result.audio };
  });
