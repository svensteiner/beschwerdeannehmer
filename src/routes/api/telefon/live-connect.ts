import { createFileRoute } from "@tanstack/react-router";
import { openAiLiveSession } from "@/lib/beschwerden/live-session.js";

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

export const Route = createFileRoute("/api/telefon/live-connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: "Ungültige Herkunft der Live-Anfrage." }, { status: 403 });
        const key = process.env.OPENAI_API_KEY?.trim();
        if (!key) return Response.json({ ok: false, error: "Der OpenAI-Live-Modus ist auf diesem Rechner noch nicht eingerichtet." }, { status: 503 });
        const sdp = await request.text();
        if (!sdp.trim() || sdp.length > 128 * 1024) return Response.json({ ok: false, error: "Die Audioverbindung konnte nicht vorbereitet werden." }, { status: 400 });

        const body = new FormData();
        body.set("sdp", sdp);
        body.set("session", JSON.stringify(openAiLiveSession()));
        try {
          const response = await fetch(OPENAI_REALTIME_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body });
          const answer = await response.text();
          if (!response.ok || !answer.trim()) return Response.json({ ok: false, error: "OpenAI-Live hat die Audioverbindung abgelehnt." }, { status: 502 });
          return new Response(answer, { headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" } });
        } catch {
          return Response.json({ ok: false, error: "OpenAI-Live ist derzeit nicht erreichbar." }, { status: 502 });
        }
      },
    },
  },
});
