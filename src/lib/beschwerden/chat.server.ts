import { answerWithLocalRules, updateComplaintProtocol } from "./complaint-rules.js";

export type ComplaintProtocol = {
  location: string;
  category: string;
  priority: "normal" | "dringend" | "sicherheit";
  occurredAt: string;
  summary: string;
  callback: string;
};

export const emptyComplaintProtocol: ComplaintProtocol = { location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" };

/**
 * Schreibt erkannte Gesprächsinhalte in das Protokoll, ohne eine zweite Bot-Antwort
 * auszulösen. Das wird für die Live-Stimme verwendet.
 */
export function addTranscriptToProtocol(text: string, protocol: ComplaintProtocol): ComplaintProtocol {
  return updateComplaintProtocol(text, protocol) as ComplaintProtocol;
}

/**
 * Ein optionales lokales Modell formuliert Antworten, darf aber keine
 * Beschwerdedaten erfinden oder bereits geprüfte Angaben überschreiben.
 */
export function safeModelProtocol(text: string, protocol: ComplaintProtocol, _proposed: unknown): ComplaintProtocol {
  return addTranscriptToProtocol(text, protocol);
}

function fallback(text: string, protocol: ComplaintProtocol): { reply: string; protocol: ComplaintProtocol } {
  return answerWithLocalRules(text, protocol) as { reply: string; protocol: ComplaintProtocol };
}

function isLoopback(url: string) {
  try { const host = new URL(url).hostname.replaceAll("[", "").replaceAll("]", ""); return ["127.0.0.1", "localhost", "::1"].includes(host); } catch { return false; }
}

export async function answerComplaint(text: string, history: Array<{ role: "user" | "assistant"; content: string }>, protocol: ComplaintProtocol) {
  const base = String(process.env.GARAGEN_LLM_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base || !isLoopback(base)) return fallback(text, protocol);
  const safeProtocol = safeModelProtocol(text, protocol, null);
  if (safeProtocol.priority === "sicherheit") return fallback(text, protocol);
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.GARAGEN_LLM_MODEL || "llama3.2", temperature: 0.2, response_format: { type: "json_object" }, messages: [
    { role: "system", content: "Du bist ein professioneller, sachlicher Kundenservice für Parkgaragen. Sprich konsequent in der Sie-Form und frage immer nur eine fehlende Information nach. Keine Füllwörter, keine Dankesfloskeln, keine Zahlungsdaten, keine Rechtsberatung und keine erfundenen Zusagen. Antworte ausschließlich als JSON mit reply (ein kurzer deutscher Satz). Die Gesprächsdaten werden unabhängig von dir durch lokale Regeln geprüft." },
    { role: "system", content: `Bisheriges Protokoll: ${JSON.stringify(protocol)}` },
    ...history.slice(-12),
    { role: "user", content: text },
    ] }) });
  } catch {
    return fallback(text, protocol);
  }
  if (!response.ok) return fallback(text, protocol);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = payload.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(String(raw ?? "")) as { reply?: unknown; protocol?: Partial<ComplaintProtocol> };
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return fallback(text, protocol);
    return { reply: parsed.reply.trim().slice(0, 600), protocol: safeModelProtocol(text, protocol, parsed.protocol) };
  } catch { return fallback(text, protocol); }
}
