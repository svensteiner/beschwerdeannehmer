import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { listComplaints, saveComplaint } from "@/lib/beschwerden/store.server";
import { answerComplaint, emptyComplaintProtocol } from "@/lib/beschwerden/chat.server";

const MAX_BODY_BYTES = 64 * 1024;

function validPhoneToken(value: string | null): boolean {
  const expected = process.env.GARAGEN_PHONE_TOKEN ?? "";
  if (!expected || !value) return false;
  const actual = Buffer.from(value, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function replyFor(text: string): Promise<{ reply: string; endCall: boolean }> {
  const lower = text.trim().toLocaleLowerCase("de-AT");
  const answered = await answerComplaint(text, [], emptyComplaintProtocol);
  if (answered.protocol.priority === "sicherheit") return { reply: answered.reply, endCall: false };
  if (/auf wiederhören|auf wiedersehen|tschüss|danke,? das war/.test(lower)) {
    return { reply: "Danke für Ihren Anruf. Wir haben Ihr Anliegen aufgenommen und melden uns nachvollziehbar zurück. Auf Wiederhören.", endCall: true };
  }
  return { reply: answered.reply, endCall: false };
}

export const Route = createFileRoute("/api/telefon/antwort")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
        if (!validPhoneToken(token)) return Response.json({ ok: false, error: "Telefon-Gateway nicht autorisiert." }, { status: 401 });
        const raw = await request.text().catch(() => "");
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return Response.json({ ok: false, error: "Anfrage zu groß." }, { status: 413 });
        let body: { messages?: unknown };
        try { body = JSON.parse(raw) as { messages?: unknown }; } catch { return Response.json({ ok: false, error: "Ungültiges JSON." }, { status: 400 }); }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const lastUser = [...messages].reverse().find((message) => typeof message === "object" && message !== null && (message as { role?: unknown }).role === "user");
        const text = lastUser && typeof (lastUser as { content?: unknown }).content === "string" ? (lastUser as { content: string }).content.slice(0, 5000) : "";
        const result = await replyFor(text);
        const callId = typeof (body as { callId?: unknown }).callId === "string" ? (body as { callId: string }).callId.slice(0, 120) : "";
        const ended = (body as { ended?: unknown }).ended === true;
        let savedReference: string | undefined;
        const recordingAllowed = process.env.GARAGEN_PHONE_RECORDING === "on" && (body as { consent?: unknown }).consent === true;
        if (ended && callId && text && recordingAllowed) {
          const existing = (await listComplaints()).find((item) => item.description.startsWith(`Telefonanruf ${callId}:`));
          if (existing) savedReference = existing.reference;
          else {
            const now = new Date().toISOString();
            const reference = `GW-TEL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
            const caller = typeof (body as { from?: unknown }).from === "string" ? (body as { from: string }).from.slice(0, 30) : "";
            const transcript = messages.filter((message) => typeof message === "object" && message !== null && typeof (message as { role?: unknown }).role === "string" && typeof (message as { content?: unknown }).content === "string").map((message) => `${(message as { role: string }).role === "user" ? "Anrufer" : "Bot"}: ${(message as { content: string }).content.slice(0, 1000)}`).join("\n");
            await saveComplaint({ reference, createdAt: now, location: "Telefonisch – Standort noch zu klären", category: "Sonstiges", description: `Telefonanruf ${callId}:\n${transcript}`.slice(0, 5000), name: "Telefonisch", email: "", occurredAt: now, contactPhone: caller, priority: /sicher|gefahr|unfall|defekt/i.test(transcript) ? "sicherheit" : "normal" });
            savedReference = reference;
          }
        }
        return Response.json({ ok: true, reply: result.reply, source: "local", provider: "garage-local", endCall: result.endCall, ...(savedReference ? { savedReference } : {}) }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
