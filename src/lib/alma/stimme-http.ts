import { isLocalOrLanIp, isValidPhoneBearer } from "../practice/phone-auth.ts";
import { inspectRequestBodyLimit } from "./request-size-guard.ts";

export const STIMME_HOEREN_PATH = "/api/stimme/hoeren";
export const STIMME_SPRECHEN_PATH = "/api/stimme/sprechen";
/** Leftover sentences after a `saetze` speak — phone POSTs this as the next text. */
export const STIMME_REST_HEADER = "x-silvia-rest";

/** Ein STT-Chunk ist wenige Sekunden Audio — 8 MiB decken auch WAV + Base64-Overhead. */
export const STIMME_HOEREN_MAX_BYTES = 8 * 1024 * 1024;
/** Ein TTS-Prompt ist reiner Text — 64 KiB decken jede Begrüßung/Antwort. */
export const STIMME_SPRECHEN_MAX_BYTES = 64 * 1024;

/**
 * Harte Body-Grenze vor dem Einlesen: `readHoerenBody`/`readSprechenBody` puffern
 * sonst unbegrenzt. Liefert eine fertige 413-Antwort, wenn der Body zu groß ist —
 * sonst null (und der originale Request bleibt unangetastet lesbar).
 */
export async function stimmeBodyGuard(request: Request, maxBytes: number): Promise<Response | null> {
  const result = await inspectRequestBodyLimit(request, maxBytes);
  if (result === "ok") return null;
  void request.body?.cancel().catch(() => {});
  return new Response("Request body too large", { status: 413 });
}

export function writeSprechenRest(rest: string): string {
  return encodeURIComponent(String(rest ?? "").trim());
}

export function readSprechenRest(header: string | null): string {
  const raw = String(header ?? "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

export type StimmeGuardFail = { status: 401 | 429; error: string };

/** LAN + SILVIA_PHONE_TOKEN, fail-closed. Same contract as /api/telefon/antwort. */
export function stimmeGatewayFail(
  ip: string,
  authHeader: string | null,
  expectedToken: string | undefined,
): StimmeGuardFail | null {
  if (!isLocalOrLanIp(ip)) return { status: 401, error: "Nur lokal/LAN erreichbar." };
  if (!isValidPhoneBearer(authHeader, expectedToken)) return { status: 401, error: "Unauthorized" };
  return null;
}

export type HoerenBody = { audio: string; mime: string; line?: string };

export function normalizeStimmeLine(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

export async function readHoerenBody(request: Request): Promise<HoerenBody | null> {
  const ct = String(request.headers.get("content-type") ?? "");
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") ?? form.get("audio");
      if (file instanceof Blob && file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer());
        const line = normalizeStimmeLine(form.get("line"));
        return {
          audio: buf.toString("base64"),
          mime: file.type || "audio/webm",
          ...(line ? { line } : {}),
        };
      }
      const audio = String(form.get("audio") ?? "").trim();
      if (!audio) return null;
      const line = normalizeStimmeLine(form.get("line"));
      return {
        audio,
        mime: String(form.get("mime") ?? "audio/webm"),
        ...(line ? { line } : {}),
      };
    }
    const body = (await request.json()) as {
      audio?: string;
      mime?: string;
      line?: string;
    };
    const audio = String(body?.audio ?? "").trim();
    if (!audio) return null;
    const line = normalizeStimmeLine(body?.line);
    return {
      audio,
      mime: String(body?.mime ?? "audio/webm"),
      ...(line ? { line } : {}),
    };
  } catch {
    return null;
  }
}

/** Gateway: Accept audio/mpeg pipes bytes. JSON stays the default (star/star or application/json). */
export function wantsSprechenAudio(accept: string | null): boolean {
  const a = String(accept ?? "").toLowerCase();
  if (!a || a === "*/*") return false;
  const audio = a.includes("audio/");
  const json = a.includes("application/json");
  return audio && !json;
}

export type SprechenBody = { text: string; voice: string; saetze: boolean };

export async function readSprechenBody(request: Request): Promise<SprechenBody | null> {
  try {
    const body = (await request.json()) as { text?: string; voice?: string; saetze?: unknown };
    const text = String(body?.text ?? "").trim();
    if (!text) return null;
    return { text, voice: String(body?.voice ?? ""), saetze: Boolean(body?.saetze) };
  } catch {
    return null;
  }
}
