import { createFileRoute } from "@tanstack/react-router";
import { answerComplaint, emptyComplaintProtocol, type ComplaintProtocol } from "@/lib/beschwerden/chat.server";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

async function transcribe(file: File) {
  const body = new FormData();
  body.append("file", file, file.name || "sprechdemo.webm");
  body.append("language", "de");
  body.append("response_format", "json");
  const response = await fetch("http://127.0.0.1:8178/v1/audio/transcriptions", { method: "POST", body });
  if (!response.ok) throw new Error("Whisper ist lokal nicht erreichbar.");
  const payload = await response.json() as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("Es wurde keine Sprache erkannt.");
  return text;
}

export const Route = createFileRoute("/api/telefon/sprechen")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("audio");
          if (!(file instanceof File) || file.size === 0) return Response.json({ ok: false, error: "Audio fehlt." }, { status: 400 });
          if (file.size > MAX_AUDIO_BYTES) return Response.json({ ok: false, error: "Audio ist zu groß." }, { status: 413 });
          const text = await transcribe(file);
          const history = (() => { try { const value = JSON.parse(String(form.get("history") ?? "[]")); return Array.isArray(value) ? value : []; } catch { return []; } })();
          const protocol = (() => { try { return { ...emptyComplaintProtocol, ...JSON.parse(String(form.get("protocol") ?? "{}")) } as ComplaintProtocol; } catch { return emptyComplaintProtocol; } })();
          const result = await answerComplaint(text, history, protocol);
          const reply = result.reply;
          const tts = await fetch("http://127.0.0.1:8179/v1/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: reply, voice: "ara", response_format: "wav" }) });
          if (!tts.ok) throw new Error("Piper ist lokal nicht erreichbar.");
          const audio = Buffer.from(await tts.arrayBuffer()).toString("base64");
          return Response.json({ ok: true, text, reply, protocol: result.protocol, audio, mime: "audio/wav", source: process.env.GARAGEN_LLM_BASE_URL ? "lokales Modell" : "lokale Regeln" }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Lokale Sprachdienste sind nicht verfügbar." }, { status: 503 });
        }
      },
    },
  },
});
