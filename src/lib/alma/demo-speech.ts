/** Demo vocabulary is local to this browser, never a practice rule or server log. */
export const DEMO_SPEECH_KEY = "silvia.demo-speech-terms.v1";
export const DEMO_SPEECH_LIMIT = 20;
export type SpeechStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeDemoSpeechTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(-100).reverse()) {
    if (typeof item !== "string") continue;
    const term = item.trim().replace(/\s+/g, " ");
    if (!term || term.length > 40 || !/\p{L}/u.test(term)) continue;
    if (!/^[\p{L}\p{M}\p{N} .()/'-]+$/u.test(term)) continue;
    const key = term.toLocaleLowerCase("de-AT");
    if (seen.has(key)) continue;
    seen.add(key);
    out.unshift(term);
    if (out.length === DEMO_SPEECH_LIMIT) break;
  }
  return out;
}

function browserStorage(): SpeechStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

export function readDemoSpeechTerms(storage = browserStorage()): string[] {
  try { return normalizeDemoSpeechTerms(JSON.parse(storage?.getItem(DEMO_SPEECH_KEY) ?? "[]")); }
  catch { return []; }
}

export function writeDemoSpeechTerms(terms: unknown, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(DEMO_SPEECH_KEY, JSON.stringify(normalizeDemoSpeechTerms(terms)));
    return true;
  } catch { return false; }
}
