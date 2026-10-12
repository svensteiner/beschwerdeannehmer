import { answerWithLocalRules } from "./complaint-rules.js";

export type ComplaintProtocol = {
  location: string;
  category: string;
  priority: "normal" | "dringend" | "sicherheit";
  occurredAt: string;
  summary: string;
  callback: string;
};

export const emptyComplaintProtocol: ComplaintProtocol = { location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" };

function fallback(text: string, protocol: ComplaintProtocol): { reply: string; protocol: ComplaintProtocol } {
  return answerWithLocalRules(text, protocol) as { reply: string; protocol: ComplaintProtocol };
}

function isLoopback(url: string) {
  try { const host = new URL(url).hostname.replaceAll("[", "").replaceAll("]", ""); return ["127.0.0.1", "localhost", "::1"].includes(host); } catch { return false; }
}

export async function answerComplaint(text: string, history: Array<{ role: "user" | "assistant"; content: string }>, protocol: ComplaintProtocol) {
  const base = String(process.env.GARAGEN_LLM_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base || !isLoopback(base)) return fallback(text, protocol);
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.GARAGEN_LLM_MODEL || "llama3.2", temperature: 0.2, response_format: { type: "json_object" }, messages: [
    { role: "system", content: "Du bist ein freundlicher österreichischer Kundenservice für Parkgaragen. Frage immer nur eine fehlende Information nach. Keine Zahlungsdaten, keine Rechtsberatung, keine erfundenen Zusagen. Antworte ausschließlich als JSON mit reply (kurzer deutscher Satz) und protocol (location, category, priority normal|dringend|sicherheit, occurredAt, summary, callback)." },
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
    const merged: ComplaintProtocol = { ...protocol, ...parsed.protocol };
    if (!["normal", "dringend", "sicherheit"].includes(merged.priority)) merged.priority = protocol.priority;
    return { reply: parsed.reply.trim().slice(0, 600), protocol: merged };
  } catch { return fallback(text, protocol); }
}
