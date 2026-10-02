import { createFileRoute } from "@tanstack/react-router";
import { answerComplaint, emptyComplaintProtocol, type ComplaintProtocol } from "@/lib/beschwerden/chat.server";

export const Route = createFileRoute("/api/telefon/chat")({
  server: { handlers: { POST: async ({ request }) => {
    const body = await request.json().catch(() => null) as { text?: unknown; history?: unknown; protocol?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
    if (!text) return Response.json({ ok: false, error: "Bitte etwas eingeben." }, { status: 400 });
    const history = Array.isArray(body?.history) ? body.history.filter((item): item is { role: "user" | "assistant"; content: string } => typeof item === "object" && item !== null && ((item as { role?: unknown }).role === "user" || (item as { role?: unknown }).role === "assistant") && typeof (item as { content?: unknown }).content === "string").slice(-12) : [];
    const protocol = { ...emptyComplaintProtocol, ...(typeof body?.protocol === "object" && body.protocol ? body.protocol : {}) } as ComplaintProtocol;
    const result = await answerComplaint(text, history, protocol);
    return Response.json({ ok: true, ...result, source: process.env.GARAGEN_LLM_BASE_URL ? "lokales Modell" : "lokale Regeln" }, { headers: { "Cache-Control": "no-store" } });
  } } },
});
