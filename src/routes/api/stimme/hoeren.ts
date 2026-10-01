// POST /api/stimme/hoeren — Audio → Text über llmStt + correctNumbers.
// Vertrag für C:\silvia-phone: JSON { audio, mime } oder multipart file/audio.
// Guards wie /api/telefon/antwort (LAN + SILVIA_PHONE_TOKEN). Keine Logikkopie:
// hoerenAudio() ist derselbe Kern wie transcribeAlma.
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { hoerenAudio } from "@/lib/alma/transcribe";
import {
  STIMME_HOEREN_MAX_BYTES,
  normalizeStimmeLine,
  readHoerenBody,
  stimmeBodyGuard,
  stimmeGatewayFail,
} from "@/lib/alma/stimme-http";

export const Route = createFileRoute("/api/stimme/hoeren")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getRequestIP() || "";
        const denied = stimmeGatewayFail(ip, request.headers.get("authorization"), process.env.SILVIA_PHONE_TOKEN);
        if (denied) return Response.json({ error: denied.error }, { status: denied.status });

        const { takeToken } = await import("@/lib/practice/rate-limit");
        if (!takeToken(`stimme-api:${ip}`, 60, 60_000).allowed) {
          return Response.json({ error: "Zu viele Anfragen." }, { status: 429 });
        }

        const oversized = await stimmeBodyGuard(request, STIMME_HOEREN_MAX_BYTES);
        if (oversized) return oversized;

        const body = await readHoerenBody(request);
        if (!body) return Response.json({ error: "audio ist Pflicht." }, { status: 400 });

        const line = body.line || normalizeStimmeLine(process.env.SILVIA_PHONE_LINE);
        const { fetchProfileBySlug } = await import("@/lib/practice/profile-data.server");
        const practiceId = line ? (await fetchProfileBySlug(line))?.id : undefined;
        const result = await hoerenAudio({
          audio: body.audio,
          mime: body.mime,
          ip,
          practiceId,
        });
        if (!result.ok) {
          return Response.json({ ok: false, text: "", reason: result.reason }, { status: result.reason === "rate" ? 429 : 200 });
        }
        return Response.json({ ok: true, text: result.text });
      },
    },
  },
});
