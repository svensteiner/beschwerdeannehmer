import { createFileRoute } from "@tanstack/react-router";
import { addTranscriptToProtocol, emptyComplaintProtocol, type ComplaintProtocol } from "@/lib/beschwerden/chat.server";

const MAX_TRANSCRIPT_LENGTH = 2_000;

export const Route = createFileRoute("/api/telefon/protokoll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null) as { text?: unknown; protocol?: unknown } | null;
        const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TRANSCRIPT_LENGTH) : "";
        if (!text) return Response.json({ ok: false, error: "Kein Gesprächsausschnitt vorhanden." }, { status: 400 });
        const protocol = { ...emptyComplaintProtocol, ...(typeof body?.protocol === "object" && body.protocol ? body.protocol : {}) } as ComplaintProtocol;
        return Response.json({ ok: true, protocol: addTranscriptToProtocol(text, protocol) }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
