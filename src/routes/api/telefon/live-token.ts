import { createFileRoute } from "@tanstack/react-router";
import { openAiLiveSession } from "@/lib/beschwerden/live-session.js";

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets";

export const Route = createFileRoute("/api/telefon/live-token")({
  server: {
    handlers: {
      POST: async () => {
        const key = process.env.OPENAI_API_KEY?.trim();
        if (!key) return Response.json({ ok: false, error: "Der OpenAI-Live-Modus ist auf diesem Rechner noch nicht eingerichtet." }, { status: 503 });

        const response = await fetch(OPENAI_REALTIME_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(openAiLiveSession()),
        });
        const payload = await response.json().catch(() => ({})) as { value?: unknown; client_secret?: { value?: unknown }; error?: { message?: unknown } };
        const token = typeof payload.value === "string" ? payload.value : typeof payload.client_secret?.value === "string" ? payload.client_secret.value : "";
        if (!response.ok || !token) return Response.json({ ok: false, error: typeof payload.error?.message === "string" ? payload.error.message : "OpenAI-Live konnte nicht gestartet werden." }, { status: 502 });
        return Response.json({ ok: true, token }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
