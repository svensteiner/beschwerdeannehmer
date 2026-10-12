export type ComplaintProtocol = {
  location: string;
  category: string;
  priority: "normal" | "dringend" | "sicherheit";
  occurredAt: string;
  summary: string;
  callback: string;
};

export const emptyComplaintProtocol: ComplaintProtocol = { location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" };

function compact(value: string, limit: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

function locationFrom(text: string) {
  const ending = "(?=\\s+(?:hat|um|nicht|ist|war|gegen|heute|gestern|die|der|das)\\b|[,.]|$)";
  const nearby = new RegExp(`\\b(?:in|bei)\\s+(?:(?:der|die|dem|den)\\s+)?(?:garage\\s+)?([A-ZÄÖÜ][\\wÄÖÜäöüß .-]{2,50}?)${ending}`, "iu");
  const named = new RegExp(`\\b(?:garage|standort)\\s+([A-ZÄÖÜ][\\wÄÖÜäöüß .-]{2,50}?)${ending}`, "iu");
  return nearby.exec(text)?.[1]?.trim() ?? named.exec(text)?.[1]?.trim() ?? "";
}

function occurredAtFrom(text: string) {
  const match = text.match(/\b(heute|gestern|vorgestern|am\s+[A-Za-zäöüÄÖÜ]+|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|gegen\s+\d{1,2}(?::\d{2})?\s*(?:uhr)?)\b/iu);
  return match ? compact(match[1], 40) : "";
}

function callbackFrom(text: string) {
  const phone = text.match(/(?:\+43|00\s*43|0)\s*(?:[\d\s()/.-]{6,})/u)?.[0];
  return phone ? compact(phone, 30).replace(/[.,;:]+$/u, "") : "";
}

function nextQuestion(protocol: ComplaintProtocol) {
  if (!protocol.category) return "Worum geht es genau – Einfahrt, Parkticket, Abrechnung, E-Laden oder Sauberkeit und Sicherheit?";
  if (!protocol.location) return "Welche Garage oder welcher Standort ist betroffen?";
  if (!protocol.occurredAt) return "Wann war der Vorfall ungefähr?";
  if (!protocol.callback) return "Unter welcher Telefonnummer dürfen wir Sie bei Rückfragen erreichen?";
  return "Danke, das Protokoll ist vollständig. Der Betreiber kann den Vorgang jetzt prüfen.";
}

function fallback(text: string, protocol: ComplaintProtocol): { reply: string; protocol: ComplaintProtocol } {
  const lower = text.toLocaleLowerCase("de-AT");
  const next = { ...protocol };
  if (!next.category) {
    if (/ticket|schranke|einfahrt|ausfahrt/.test(lower)) next.category = /ticket/.test(lower) ? "Parkticket oder Schranke" : "Ein-/Ausfahrt";
    else if (/laden|e-lad/.test(lower)) next.category = "E-Laden";
    else if (/abrechnung|zahlung|rechnung/.test(lower)) next.category = "Parkgebühr oder Abrechnung";
    else if (/sicher|gefahr|unfall|defekt/.test(lower)) next.category = "Sauberkeit oder Sicherheit";
  }
  if (/sicher|gefahr|unfall|defekt/.test(lower)) next.priority = "sicherheit";
  if (!next.location) next.location = locationFrom(text);
  if (!next.occurredAt) next.occurredAt = occurredAtFrom(text);
  if (!next.callback) next.callback = callbackFrom(text);
  next.summary = compact([next.summary, text].filter(Boolean).join(" "), 1000);
  const reply = nextQuestion(next);
  return { reply, protocol: next };
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
