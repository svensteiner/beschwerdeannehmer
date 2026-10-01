import type { Patient } from "./patients.ts";

/**
 * Datenabgleich, wie bei der Bank: bevor Silvia eine Akte vorliest oder einen
 * Termin fuer eine bekannte Halterin bestaetigt, muss die Anruferin sich mit
 * Name UND (Adresse ODER Handynummer) ausweisen. Rein/pure, keine Server-Importe.
 */

export type ChatTurnLike = { role: string; content: string };

export type IdentifyResult = {
  identified: boolean;
  owner?: string;
  how?: "address" | "phone";
  patient?: Patient;
  /** Nachname einer Halterin genannt, aber Adresse/Handynummer fehlt noch. */
  namedOwner?: string;
};

/** Erste Zeile des Datenabgleichs, angehaengt an die Begruessung. */
export const IDENT_GREETING_SUFFIX =
  " Für den Datenabgleich brauche ich nur noch Ihre Adresse.";

function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(text: string): string {
  return String(text ?? "").replace(/\D+/g, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OWNER_TITLE_RE =
  /^(frau|herr|familie|mag\.?|dr\.?|dris\.?|di|ing\.?)\s+/i;

/** "Mag. Eva Berger" -> "Berger", "Frau Leitner" -> "Leitner". Heuristic: last token wins. */
function ownerSurname(owner: string): string {
  let cleaned = String(owner ?? "").trim();
  // Titel koennen sich haeufen ("Mag. Dr. ..."), daher wiederholt abstreifen.
  while (OWNER_TITLE_RE.test(cleaned)) {
    cleaned = cleaned.replace(OWNER_TITLE_RE, "").trim();
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts.at(-1) ?? cleaned;
}

type ParsedAddress = { street: string; houseNumber: string; zip: string };

/** "Lange Gasse 8, 1080 Wien" -> { street: "Lange Gasse", houseNumber: "8", zip: "1080" }. */
function parseAddress(address: string): ParsedAddress {
  const m = String(address ?? "").match(
    /^(.*?)\s+(\d+[a-zA-Z]?)\s*,\s*(\d{4})\b/,
  );
  if (!m)
    return { street: String(address ?? "").trim(), houseNumber: "", zip: "" };
  return { street: m[1].trim(), houseNumber: m[2], zip: m[3] };
}

/** Strassenname (frei) ODER Hausnummer+PLZ direkt hintereinander im normalisierten Text. */
function addressTokenHit(normalizedText: string, address?: string): boolean {
  if (!address) return false;
  const { street, houseNumber, zip } = parseAddress(address);
  if (street) {
    const streetNorm = normalize(street);
    if (streetNorm && normalizedText.includes(streetNorm)) return true;
  }
  if (houseNumber && zip) {
    const pattern = new RegExp(
      `\\b${escapeRegExp(houseNumber.toLowerCase())}\\b[^0-9]{0,6}${zip}`,
    );
    if (pattern.test(normalizedText)) return true;
  }
  return false;
}

/** Ruft die Anruferin >=6 zusammenhaengende Ziffern, die auf die hinterlegte Nummer passen? */
function phoneSuffixHit(callerDigits: string, ownerPhone: string): boolean {
  const ownerDigits = digitsOnly(ownerPhone);
  if (ownerDigits.length < 6 || callerDigits.length < 6) return false;
  const maxLen = Math.min(ownerDigits.length, 12);
  for (let len = maxLen; len >= 6; len--) {
    if (callerDigits.includes(ownerDigits.slice(-len))) return true;
  }
  return false;
}

/**
 * Datenabgleich aus dem bisherigen Gespraech: Name auf der Akte UND
 * (Strassen-Token der hinterlegten Adresse ODER >=6 zusammenhaengende
 * Ziffern der hinterlegten Nummer) in einer Anruferin-Zeile (role "user").
 * Rein, ohne Seiteneffekt; Gross-/Kleinschreibung und Umlaute/Leerzeichen egal.
 */
export function identifyCaller(
  transcript: readonly ChatTurnLike[],
  patients: readonly Patient[],
): IdentifyResult {
  const callerTurns = (transcript ?? []).filter((t) => t?.role === "user");
  if (!callerTurns.length) return { identified: false };
  const normalizedTurns = callerTurns.map((t) => normalize(t.content));
  let namedOwner: string | undefined;

  for (const patient of patients) {
    const surname = normalize(ownerSurname(patient.owner));
    if (!surname) continue;
    const nameHit = normalizedTurns.some((t) =>
      new RegExp(`\\b${escapeRegExp(surname)}\\b`).test(t),
    );
    if (!nameHit) continue;

    const addressHit = normalizedTurns.some((t) =>
      addressTokenHit(t, patient.address),
    );
    const phoneHit = callerTurns.some((t) =>
      phoneSuffixHit(digitsOnly(t.content), patient.phone),
    );
    if (addressHit || phoneHit) {
      return {
        identified: true,
        owner: patient.owner,
        how: addressHit ? "address" : "phone",
        patient,
      };
    }
    namedOwner ??= patient.owner;
  }
  return namedOwner ? { identified: false, namedOwner } : { identified: false };
}

/**
 * Datenabgleich-Bitte. Ohne Namen: fragt Name UND Adresse/Handynummer.
 * Mit bekanntem Namen (z.B. schon genannt, aber noch nicht abgeglichen):
 * fragt nur noch nach Adresse/Handynummer.
 */
export function identificationPrompt(name?: string, demoCallerNumber = false): string {
  const label = String(name ?? "").trim();
  if (label) {
    return `Gern, ${label}.${demoCallerNumber ? " In dieser Demo wird mir Ihre Handynummer simuliert angezeigt." : ""} Für den Datenabgleich brauche ich noch Ihre Adresse.`;
  }
  return "Gern. Für den Datenabgleich brauche ich zuerst Ihren Namen und die Adresse oder die Handynummer, unter der Sie bei uns sind.";
}
