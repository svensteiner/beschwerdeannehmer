// POST /api/stimme/sprechen — Text → Audio über llmTtsWithMime.
// Vertrag für C:\silvia-phone: JSON { text, voice, saetze? }. Accept: audio/* liefert
// den Provider-Stream (kein Base64). Tenant-Begrüßung kommt vom Gateway als
// text (greetingFor), nie Huber. Guards wie /api/telefon/antwort.
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { sprechenStream, sprechenText } from "@/lib/alma/speak";
import {
  STIMME_REST_HEADER,
  STIMME_SPRECHEN_MAX_BYTES,
  readSprechenBody,
  stimmeBodyGuard,
  stimmeGatewayFail,
  wantsSprechenAudio,
  writeSprechenRest,
} from "@/lib/alma/stimme-http";

export const Route = createFileRoute("/api/stimme/sprechen")({
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

        const oversized = await stimmeBodyGuard(request, STIMME_SPRECHEN_MAX_BYTES);
        if (oversized) return oversized;

        const body = await readSprechenBody(request);
        if (!body) return Response.json({ error: "text ist Pflicht." }, { status: 400 });

        if (wantsSprechenAudio(request.headers.get("accept"))) {
          const streamed = await sprechenStream({
            text: body.text,
            voice: body.voice,
            ip,
            saetze: body.saetze,
          });
          if (!streamed.ok) {
            return Response.json({ ok: false, reason: streamed.reason }, { status: streamed.reason === "rate" ? 429 : 200 });
          }
          const headers: Record<string, string> = {
            "content-type": streamed.mime,
            "cache-control": "no-store",
          };
          if (streamed.rest) headers[STIMME_REST_HEADER] = writeSprechenRest(streamed.rest);
          return new Response(streamed.stream, { status: 200, headers });
        }

        const result = await sprechenText({
          text: body.text,
          voice: body.voice,
          ip,
          saetze: body.saetze,
        });
        if (!result.ok) {
          return Response.json({ ok: false, reason: result.reason }, { status: result.reason === "rate" ? 429 : 200 });
        }
        return Response.json({
          ok: true,
          audio: result.audio,
          mime: result.mime,
          ...(result.rest ? { rest: result.rest } : {}),
        });
      },
    },
  },
});
