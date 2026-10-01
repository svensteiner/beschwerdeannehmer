// AP 27 — Auth-/Netzguard fuer POST /api/telefon/antwort. Pure Funktionen, kein
// DB-/Server-Zugriff, damit sie ohne Praxis-Setup testbar sind. Der eigentliche
// Aufruf (session.server.ts clientIp()) bleibt in der Route.

/** Konstante Vergleichszeit gegen simple Timing-Angriffe auf den Bearer-Token. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Erwartet "Bearer <token>". Ohne konfiguriertes Token gilt jeder Versuch als ungueltig (fail-closed). */
export function isValidPhoneBearer(authHeader: string | null, expectedToken: string | undefined): boolean {
  const token = String(expectedToken ?? "").trim();
  if (!token) return false;
  const header = String(authHeader ?? "");
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(match[1].trim(), token);
}

/**
 * 127.0.0.1/::1 oder privates LAN (10.x, 172.16-31.x, 192.168.x).
 * Das Telefon-Gateway laeuft nie im Internet.
 *
 * Erst die FORM pruefen, dann die Bedeutung. Vorher entschied ein
 * Praefix-Vergleich („127.“) vor der Oktett-Pruefung: „127.invalid“ galt damit
 * als lokale Adresse, und ein Angreifer konnte sich mit einem beliebigen
 * Namen, der so beginnt, als lokal ausgeben.
 */
export function isLocalOrLanIp(ip: string): boolean {
  const value = String(ip ?? "").trim();
  if (!value) return false;
  if (value === "::1" || value === "localhost") return true;
  const v4 = value.startsWith("::ffff:") ? value.slice(7) : value;
  const parts = v4.split(".");
  if (parts.length !== 4) return false;
  // Jedes Oktett muss aus Ziffern bestehen: „127..0.1“ ergaebe sonst ueber
  // Number("") eine 0 und waere faelschlich gueltig.
  if (!parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  const [a, b] = parts.map(Number);
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Bereiche in Anfuehrungszeichen. Dort steht zitiertes Wort, nicht Silvias Rede. */
function quotedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const pairs: Array<[string, string]> = [
    ["„", "“"],
    ["«", "»"],
    ["‚", "‘"],
    ['"', '"'],
  ];
  for (const [open, close] of pairs) {
    let from = 0;
    for (;;) {
      const start = text.indexOf(open, from);
      if (start === -1) break;
      const end = open === close
        ? text.indexOf(close, start + 1)
        : text.indexOf(close, start + open.length);
      if (end === -1) {
        ranges.push([start, text.length]);
        break;
      }
      ranges.push([start, end + close.length]);
      from = end + close.length;
    }
  }
  return ranges;
}

/**
 * Silvia beendet Anrufe nicht per Wortwahl-Konvention im System-Prompt —
 * Heuristik fuer die Telefon-Bruecke: eine Verabschiedungsfloskel am Satzende
 * gilt als Gespraechsende.
 *
 * Zitiertes Wort zaehlt nicht. „Sie sagten: bis bald“ ist eine Wiedergabe der
 * Worte der Anruferin, kein Abschied von Silvia — vorher legte der Satz
 * trotzdem auf. Ebenso wenig zaehlt eine Floskel hinter einem Doppelpunkt oder
 * nach einem Berichtsverb im selben Satz.
 *
 * Im Zweifel wird NICHT aufgelegt: ein faelschlich beendetes Gespraech ist
 * schlimmer als eines, das die Bruecke oder die Anruferin beendet.
 */
export function detectEndCall(replyText: string): boolean {
  const t = String(replyText ?? "").trim();
  if (!t) return false;
  const match = /(auf\s+wieder(h[oö]ren|schauen|sehen)|sch[oö]nen\s+tag\s+noch|einen\s+sch[oö]nen\s+tag|bis\s+bald)\s*[.!]?\s*$/i.exec(t);
  if (!match) return false;
  const at = match.index;
  // 1. Floskel innerhalb eines Zitats.
  if (quotedRanges(t).some(([start, end]) => at >= start && at < end)) return false;
  const before = t.slice(0, at);
  // 2. Floskel direkt hinter einem Doppelpunkt oder Anfuehrungszeichen.
  if (/[:„“"«»‚‘]\s*$/.test(before)) return false;
  // 3. Berichtsverb im selben Satz („Sie sagten …“).
  const lastStop = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n"),
  );
  const clause = before.slice(lastStop + 1);
  if (/\b(?:sagten|gesagt|zitat|ihre\s+worte|erwähnt)\b/i.test(clause)) return false;
  return true;
}
