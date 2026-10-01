export type SilviaAction = {
  type: "none" | "book" | "emergency" | "train";
  owner: string;
  pet: string;
  kind: string;
  concern: string;
  summary: string;
  species?: string;
  chip?: string;
  akteNote?: string;
  fact?: string;
  /** AP 7d Teil 2 (booking.ts, connector path only): ISO-Slot, den die Connector-Zustandsmaschine
   * vorgeschlagen bzw. gebucht hat. Ungesetzt = Tafel-Pfad unveraendert (board.ts legt den Slot
   * wie bisher lokal). */
  connectorStart?: string;
  /** true erst NACH erfolgreichem createAppointment() — board.ts darf erst dann als gebucht schreiben. */
  connectorApplied?: boolean;
  /** Strukturierte Vquadrat-Terminnummer nach erfolgreicher externer Buchung. */
  connectorAppointmentId?: string;
  preferredDate?: string;
};

const EMPTY: SilviaAction = {
  type: "none",
  owner: "Klientel",
  pet: "Patient",
  kind: "Anliegen",
  concern: "",
  summary: "",
  species: "",
  chip: "",
  akteNote: "",
};

export function parseSilviaReply(
  raw: string,
  userText: string,
  opts?: { includeDemo?: boolean },
): { text: string; action: SilviaAction } {
  let text = raw.trim();
  let action: SilviaAction = {
    ...EMPTY,
    concern: userText.slice(0, 180),
    pet: guessPet(userText, opts),
    owner: guessOwner(userText, opts),
    species: guessSpecies(userText),
    chip: guessChip(userText),
    akteNote: userText.slice(0, 180),
  };
  const m = text.match(/<<ACTION\s*(\{[\s\S]*?\})\s*>>/);
  if (m) {
    text = text.replace(m[0], "").trim();
    try {
      const j = JSON.parse(m[1]) as Partial<SilviaAction> & { fact?: string };
      const type =
        j.type === "book" || j.type === "emergency" || j.type === "train" ? j.type : "none";
      action = {
        type,
        owner: String(j.owner ?? action.owner).slice(0, 80),
        pet: String(j.pet ?? action.pet).slice(0, 40),
        kind: String(j.kind ?? (type === "train" ? "Schulung" : "Termin")).slice(0, 60),
        concern: String(j.concern ?? userText).slice(0, 180),
        summary: String(j.summary ?? "").slice(0, 220),
        species: String(j.species ?? action.species).slice(0, 20),
        chip: String(j.chip ?? action.chip).replace(/\D/g, "").slice(0, 16),
        akteNote: String(j.akteNote ?? j.concern ?? userText).slice(0, 220),
        fact: String(j.fact ?? (type === "train" ? j.summary ?? userText : "")).slice(0, 240),
      };
    } catch {
      /* infer below */
    }
  }
  const blob = `${userText} ${text}`.toLowerCase();
  const callbackAsk = /rückruf|zurückruf|rufen sie mich|rufen sie uns|callback/i.test(userText);
  const slotAsk = /\btermin\b|\bslot\b|impfung|kastration/i.test(userText);
  if (action.type === "none") {
    if (/atemnot|bläulich|blut|krampf|gift|unfall|bewusstlos|aufgebläht/.test(blob)) {
      action = { ...action, type: "emergency", summary: text.slice(0, 220) };
    } else if (callbackAsk && !slotAsk) {
      action = { ...action, kind: "Rückruf", summary: action.summary || "Rückrufbitte" };
    } else if (
      !/rückrufzettel/i.test(blob) &&
      /ich (hätte|setze|lege)|termin|slot|morgen um|halb zehn/.test(blob)
    ) {
      action = { ...action, type: "book", kind: guessKind(userText) };
    }
  }
  if (action.type === "book" && callbackAsk && !slotAsk) {
    action = { ...action, type: "none", kind: "Rückruf", summary: action.summary || "Rückrufbitte" };
  }
  if (!action.chip) action.chip = guessChip(userText);
  return { text, action: fillActionNames(action, userText, opts) };
}

const NAME_STOP = new Set([
  "wir",
  "ich",
  "sie",
  "mein",
  "meine",
  "unser",
  "unsere",
  "einen",
  "eine",
  "einem",
  "ein",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "termin",
  "heute",
  "morgen",
  "bitte",
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
  "jänner",
  "kroatien",
  "italien",
  "ungarn",
  "slowenien",
  "österreich",
  "wien",
  "silvia",
  "ordination",
  "hund",
  "hunde",
  "katze",
  "kater",
  "hündin",
  "welpe",
  "tier",
  "reise",
  "ausweis",
  "impfung",
  "kontrolle",
  "notfall",
  "chip",
  "blut",
  "frau",
  "herr",
  "doktor",
  "doktorin",
  "nummer",
  "handy",
  "handynummer",
  "telefonnummer",
  "telefon",
  "adresse",
  "mailadresse",
  "emailadresse",
  "festnetz",
  "email",
  "mail",
]);

function titleName(raw: string) {
  return raw
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join("-");
}

/** Letters plus one Bindestrich (Anna-Lena, Müller-Leitner). `\b` stops at `-`. */
const NAME_CORE = "([A-ZÄÖÜa-zäöüß]{2,20}(?:-[A-ZÄÖÜa-zäöüß]{2,20})?)";
const NAME_CAP = "([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,19}(?:-[A-ZÄÖÜa-zäöüß]{2,20})?)";
const NAME_END = "(?=$|[\\s,.;:!?])";

function plausiblePet(raw: string | undefined) {
  if (!raw) return null;
  const n = raw.trim();
  if (n.length < 2 || n.length > 28) return null;
  if (NAME_STOP.has(n.toLowerCase())) return null;
  if (n.split("-").some((part) => NAME_STOP.has(part.toLowerCase()))) return null;
  return titleName(n);
}

/** Huber Stamm names. Live Tafeln must not invent them without Frau/Herr. */
const DEMO_OWNERS = /\b(leitner|pichler|gruber|nowak|moser|berger|steiner)\b/i;

/** Huber demo pets. Live must not treat "Ich bin Felix" as a named Akte. */
const DEMO_PETS = /\b(wastl|mizzi|bella|rex|luna|felix|fritz|luzi|oskar|asta)\b/i;

/** Pull a spoken pet. Huber Stamm names only with includeDemo; für/braucht/Katze stay. */
export function guessPet(t: string, opts?: { includeDemo?: boolean }) {
  if (opts?.includeDemo) {
    const known = t.match(DEMO_PETS);
    if (known) return titleName(known[1]);
  }
  const named = t.match(
    new RegExp(
      `(?:katze|kater|hund|hündin|welpe|tier)\\s+(?:heißt\\s+|namens\\s+)?${NAME_CAP}${NAME_END}`,
      "i",
    ),
  );
  const fromNamed = plausiblePet(named?.[1]);
  if (fromNamed) return fromNamed;
  const mine = t.match(
    new RegExp(
      `(?:meine[r]?|unsere[r]?|der|die)\\s+(?:katze|kater|hund)\\s+${NAME_CORE}${NAME_END}`,
      "i",
    ),
  );
  const fromMine = plausiblePet(mine?.[1]);
  if (fromMine) return fromMine;
  const fuer = t.match(new RegExp(`\\bfür\\s+${NAME_CORE}${NAME_END}`, "i"));
  const fromFuer = plausiblePet(fuer?.[1]);
  if (fromFuer) return fromFuer;
  const wegen = t.match(
    new RegExp(
      `\\bwegen(?:\\s+(?:meiner|meinem|unserer|der|dem|den|die))?\\s+${NAME_CORE}${NAME_END}`,
      "i",
    ),
  );
  const fromWegen = plausiblePet(wegen?.[1]);
  if (fromWegen) return fromWegen;
  const verbPattern = new RegExp(`\\b${NAME_CAP}\\s+(braucht|hat|ist|soll|kommt)\\b`, "g");
  for (const verb of t.matchAll(verbPattern)) {
    const fromVerb = plausiblePet(verb[1]);
    if (fromVerb) return fromVerb;
  }
  return "Patient";
}

export function guessOwner(t: string, opts?: { includeDemo?: boolean }) {
  const spoken = String(t ?? "").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, " ");
  if (opts?.includeDemo) {
    const known = spoken.match(DEMO_OWNERS);
    if (known) return `Klientel ${titleName(known[1])}`;
  }
  const intro = spoken.match(
    new RegExp(
      `(?:ich bin|mein name ist|hier ist|ich heiße)\\s+(?:frau|herr|dr\\.?\\s*)?${NAME_CAP}${NAME_END}`,
      "i",
    ),
  );
  const fromIntro = plausiblePet(intro?.[1]);
  if (fromIntro && !/^doktor/i.test(fromIntro)) return `Klientel ${fromIntro}`;
  const titled = spoken.match(new RegExp(`\\b(?:frau|herr)\\s+${NAME_CAP}${NAME_END}`, "i"));
  const fromTitle = plausiblePet(titled?.[1]);
  if (fromTitle && !/^doktor/i.test(fromTitle)) return `Klientel ${fromTitle}`;
  return "Klientel";
}

export function displayOwner(raw: string) {
  const n = String(raw ?? "").replace(/^Klientel\s+/i, "").trim();
  return n || "Klientel";
}

export function guessSpecies(t: string) {
  if (/katze|kater|mietze/i.test(t)) return "Katze";
  if (/hund|hündin|welpe/i.test(t)) return "Hund";
  return "";
}

/** Keep a named Akte (lookup) and fill gaps from the spoken sentence. */
export function fillActionNames(
  action: SilviaAction,
  userText: string,
  opts?: { includeDemo?: boolean },
): SilviaAction {
  if (action.type === "train") return action;
  const guessedPet = guessPet(userText, opts);
  const guessedOwner = guessOwner(userText, opts);
  const placeholderPet = !action.pet || action.pet === "Patient" || action.pet === "Hund";
  const pet = !placeholderPet ? action.pet : guessedPet !== "Patient" ? guessedPet : action.pet || "Patient";
  const owner =
    action.owner && action.owner !== "Klientel" ? action.owner : guessedOwner;
  const species = action.species || guessSpecies(userText);
  return { ...action, pet, owner, species };
}

function guessChip(t: string) {
  const m = t.match(/\b(\d{15})\b/) ?? t.match(/\b(0400\d{11})\b/);
  if (m) return m[1];
  // Punkt 10: mit Leerzeichen/Punkten/Strichen getrennte 15 Ziffern, z. B.
  // „040 098 100 123 456“. Nur exakt 15 Ziffern gelten als Chip — eine
  // Telefonnummer (10–13 Ziffern) wird dadurch nicht verwechselt.
  const spaced = t.match(/\b(\d[\d\s.-]{12,46}\d)\b/);
  if (spaced) {
    const digits = spaced[1].replace(/\D/g, "");
    if (digits.length === 15) return digits;
  }
  return "";
}

function guessKind(t: string) {
  if (/impf/i.test(t)) return "Impfung";
  if (/chip/i.test(t)) return "Chip / Register";
  if (/kroat|italien|ungarn|reise|ausweis/i.test(t)) return "Reise / EU-Ausweis";
  if (/lahm/i.test(t)) return "Lahmheit";
  if (/durchfall|erbrech|kot/i.test(t)) return "Magen-Darm";
  if (/kontrolle/i.test(t)) return "Kontrolle";
  return "Termin";
}

export function hasAkteTarget(action: SilviaAction) {
  return Boolean(action.pet && action.pet !== "Patient") || Boolean(action.chip);
}
