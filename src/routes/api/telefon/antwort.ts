import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 64 * 1024;

function validPhoneToken(value: string | null): boolean {
  const expected = process.env.GARAGEN_PHONE_TOKEN ?? "";
  if (!expected || !value) return false;
  const actual = Buffer.from(value, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function replyFor(text: string): { reply: string; endCall: boolean } {
  const lower = text.trim().toLocaleLowerCase("de-AT");
  if (/auf wiederhören|auf wiedersehen|tschüss|danke,? das war/.test(lower)) {
    return { reply: "Danke für Ihren Anruf. Wir haben Ihr Anliegen aufgenommen und melden uns nachvollziehbar zurück. Auf Wiederhören.", endCall: true };
  }
  if (/schranke|einfahrt|ausfahrt/.test(lower)) {
    return { reply: "Ich notiere ein Anliegen zu Ein- oder Ausfahrt. Bitte nennen Sie mir noch den Garagenstandort und ungefähr die Uhrzeit.", endCall: false };
  }
  if (/abrechnung|zahlung|rechnung/.test(lower)) {
    return { reply: "Ich notiere ein Anliegen zur Abrechnung. Bitte nennen Sie keine Zahlungsdaten am Telefon. Welcher Standort ist betroffen?", endCall: false };
  }
  if (/sicher|gefahr|unfall|defekt/.test(lower)) {
    return { reply: "Das markiere ich als sicherheitsrelevant für eine rasche Prüfung. Bitte nennen Sie mir sofort den Standort. Bei akuter Gefahr rufen Sie zusätzlich den Notruf.", endCall: false };
  }
  return { reply: "Danke, ich habe das aufgenommen. Bitte nennen Sie mir noch den Standort und was genau passiert ist.", endCall: false };
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
        const result = replyFor(text);
        return Response.json({ ok: true, reply: result.reply, source: "local", provider: "garage-local", endCall: result.endCall }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
