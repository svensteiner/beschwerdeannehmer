import {
  AT_HOLIDAYS,
  BUNDESLAENDER,
  NACHTDIENSTE,
  PRACTICE,
  PRACTICE_LOCAL,
} from "./data.ts";
import { type HourRow, isHoursTurn } from "./hours.ts";
import { IDENT_GREETING_SUFFIX } from "./identify.ts";
import { PATIENTS } from "./patients.ts";
import {
  firstHandy,
  internPracticeInbox,
  isCallbackTurn,
  isKassaTransferTurn,
  wantsAppointment,
} from "./phone.ts";
import type { PracticeProfile } from "../practice/profile.ts";

export type Desk = {
  isDemo: boolean;
  name: string;
  shortName: string;
  owner: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  phone: string;
  whatsapp: string;
  email: string;
  hours: HourRow[];
  nachtdienstName: string;
  nachtdienstPhone: string;
  nachtdienstNote: string;
  notes: string;
  locationHint: string;
  /** AP 53: Einwilligungsansage. Demo bleibt aus, echte Praxen kommen aus dem Profil. */
  consentEnabled: boolean;
  consentNote: string;
};

export function shortPracticeName(name: string) {
  const trimmed = name.replace(/^tierordination\s+/i, "").trim();
  return trimmed || name;
}

export function demoDesk(): Desk {
  return {
    isDemo: true,
    name: PRACTICE.name,
    shortName: PRACTICE.shortName,
    owner: PRACTICE.owner,
    street: PRACTICE.street,
    zip: PRACTICE.zip,
    city: PRACTICE.city,
    bundesland: PRACTICE.bundesland,
    phone: PRACTICE.phone,
    whatsapp: PRACTICE.whatsapp,
    email: PRACTICE.email,
    hours: PRACTICE.hours.map((h) => ({ day: h.day, time: h.time })),
    nachtdienstName: PRACTICE.nachtdienst.name,
    nachtdienstPhone: PRACTICE.nachtdienst.phone,
    nachtdienstNote: PRACTICE.nachtdienst.note,
    notes: "",
    locationHint: `${PRACTICE_LOCAL.bezirk}. ${PRACTICE_LOCAL.transit}. ${PRACTICE_LOCAL.parking}`,
    consentEnabled: false,
    consentNote: "",
  };
}

/** Fester Gespraechsablauf (Owner-Vorgabe, wie bei der Bank): Begruessung, dann sofort Datenabgleich. */
export function greetingFor(desk: Desk) {
  return `Grüß Gott, ${desk.name}, Silvia am Apparat.${IDENT_GREETING_SUFFIX}`;
}

/** Live empty phone stays empty — never Huber's Josefstadt number. */
export function deskLineNumber(desk: Desk | null | undefined) {
  return desk ? desk.phone : PRACTICE.phone;
}

/** WhatsApp of the Tafel is 06… only. Festnetz stays on the Leitung. */
export function deskWhatsappNumber(
  desk: Pick<Desk, "whatsapp" | "phone"> | null | undefined,
) {
  if (!desk) return "";
  return firstHandy(desk.whatsapp, desk.phone);
}

/** Spoken contact line for the live model — never names Festnetz as WhatsApp. */
export function deskContactLine(desk: Pick<Desk, "phone" | "whatsapp">) {
  const phone = String(desk.phone ?? "").trim() || "nicht hinterlegt";
  const wa = deskWhatsappNumber(desk);
  return `Telefon ${phone}, WhatsApp ${wa || "nicht hinterlegt"}.`;
}

export function whatsappSystemRule(desk: Pick<Desk, "whatsapp" | "phone">) {
  if (deskWhatsappNumber(desk)) return "";
  return `WHATSAPP: Keine 06… hinterlegt. Sage nicht, die Klientel könne die Ordination per WhatsApp schreiben, und nenne die Festnetzleitung nicht als WhatsApp. SMS und Anruf auf die hinterlegte Nummer. Die Tierarzthelferin trägt 06… in den Einstellungen ein.`;
}

export function leitungSystemRule(desk: Pick<Desk, "phone">) {
  if (String(desk.phone ?? "").trim()) return "";
  return `LEITUNG OHNE NUMMER: Erfinde keine Telefonnummer, nenne nicht 01 405 12 88 und nicht die Josefstadt. Sage, dass die Leitungsnummer in den Einstellungen fehlt.`;
}

export function ortSystemRule(desk: Pick<Desk, "city">) {
  if (String(desk.city ?? "").trim()) return "";
  return `ORT OHNE STADT: Erfinde keine Stadt, nenne nicht Wien und nicht die Josefstadt. Sage, dass der Ort in den Einstellungen fehlt.`;
}

/** Heute banner: street is there, Parkplatz/Öffi hint is not. Anreise banner already covers missing street. */
export function parkplatzIncomplete(
  street?: string | null,
  locationHint?: string | null,
) {
  return (
    Boolean(String(street ?? "").trim()) && !String(locationHint ?? "").trim()
  );
}

export function parkplatzSystemRule(input: {
  street?: string | null;
  locationHint?: string | null;
}) {
  if (!parkplatzIncomplete(input.street, input.locationHint)) return "";
  return `PARKPLATZ OHNE HINWEIS: Erfinde keinen Parkplatz, keine Kurzparkzone, kein Parkpickerl, keine U2 Rathaus und nicht die Josefstadt. Nenne nur die hinterlegte Straße. Die Tierarzthelferin trägt Parkplatz oder Öffi in den Einstellungen ein.`;
}

export function deskCityLabel(desk: Desk | null | undefined) {
  return desk ? desk.city : `${PRACTICE.city} 8`;
}

/** Spoken Notfall. Without a hinterlegte Nummer Silvia does not claim to connect. Live never claims PSTN. */
export function isPlaceholderNachtdienstNote(note?: string | null) {
  const n = String(note ?? "").trim();
  if (!n) return true;
  return /bitte in den einstellungen hinterlegen|^hinterlegte nachtklinik$/i.test(
    n,
  );
}

/** Settings Speichern and Heute Nummer. Empty `#nachtdienstNote` keeps the hinterlegte Hinweis; placeholders fall. Never invent Vetmeduni. */
export function keepNachtdienstNote(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 240);
  if (next && !isPlaceholderNachtdienstNote(next)) return next;
  const prev = String(current ?? "")
    .trim()
    .slice(0, 240);
  return isPlaceholderNachtdienstNote(prev) ? "" : prev;
}

/** Heute Nummer hinterlegen. Empty Stelle keeps the typed Klinikname; leftover directory names fall. */
export function keepNachtdienstName(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 80);
  if (next && !isPlaceholderNachtdienstName(next)) return next;
  const prev = String(current ?? "")
    .trim()
    .slice(0, 80);
  if (isPlaceholderNachtdienstName(prev) || isDirectoryNachtdienstPlace(prev))
    return "";
  return prev;
}

/** Heute Adresse hinterlegen. Empty Parkplatz keeps the typed Anreise; never invent Josefstadt. */
export function keepLocationHint(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 400);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 400);
}

/** Settings Speichern. Empty `#notes` keeps the hinterlegte Hausregel; never invent Fritz. */
export function keepNotes(incoming?: string | null, current?: string | null) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 400);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 400);
}

/** Live banner and prompt: no `#notes` and no practice_facts. Demo Huber keeps Fritz. */
export function notesIncomplete(notes?: string | null, facts: string[] = []) {
  if (String(notes ?? "").trim()) return false;
  return !facts.some((f) => String(f ?? "").trim());
}

export function notesSystemRule(
  desk: Pick<Desk, "notes" | "isDemo">,
  facts: string[] = [],
) {
  if (desk.isDemo || !notesIncomplete(desk.notes, facts)) return "";
  return `HAUSREGEL OHNE NOTIZ: Es gibt keine hinterlegte Hausregel und keine gelernten Fakten. Erfinde keine (kein Fritz nur in der Transportbox, keine Mag. Eva Berger, kein Wastl). Sage das ehrlich. Die Tierarzthelferin trägt Hausregeln auf Heute oder in den Einstellungen ein.`;
}

/** Huber demo Stammklientel. Live must not answer as if they were hinterlegt. */
export function mentionedDemoPet(message: string) {
  const t = String(message ?? "");
  for (const p of PATIENTS) {
    const n = p.name;
    if (n.length >= 3 && new RegExp(`\\b${n}\\b`, "i").test(t)) return n;
  }
  return "";
}

/** Termin/Impfung stays a book even when the Tier shares a Huber name. */
export function isNotesBookingTurn(message: string) {
  return /termin|impfung|kastration|kontrolle|lahm|slot|eintragen/i.test(
    message.toLowerCase(),
  );
}

/** Live caller asked for a Hausregel or a Huber demo pet, not a new Termin. */
export function isNotesEmptyTurn(message: string) {
  const t = message.toLowerCase();
  if (/was gilt|hausregel|welche regel|transportbox|eva berger/.test(t))
    return true;
  if (isNotesBookingTurn(message)) return false;
  return Boolean(mentionedDemoPet(message));
}

/** Spoken when live has no notes and no facts. Name the asked pet, never swap in Fritz. */
export function notesEmptySpoken(message = "") {
  const pet = mentionedDemoPet(message);
  if (pet === "Fritz" || (!pet && /transportbox|eva berger/i.test(message))) {
    return "Einen Kater Fritz kenne ich in dieser Ordination nicht. Eine Hausregel dazu fehlt noch.";
  }
  if (pet) {
    return `${pet} kenne ich in dieser Ordination nicht. Eine Hausregel dazu fehlt noch.`;
  }
  return "Eine Hausregel ist noch nicht hinterlegt. Die Tierarzthelferin trägt sie auf Heute oder in den Einstellungen ein.";
}

/** Live local + LLM overwrite. Demo and a hinterlegte Akte stay untouched. */
export function notesLiveReply(
  message: string,
  desk: Pick<Desk, "notes" | "isDemo">,
  facts: string[] = [],
  hasPatient = false,
) {
  if (
    desk.isDemo ||
    hasPatient ||
    !notesIncomplete(desk.notes, facts) ||
    !isNotesEmptyTurn(message)
  ) {
    return null;
  }
  return notesEmptySpoken(message);
}

/** Live empty Hausregel is a Tafel rule — skip the model. Demo, Schulung and hinterlegte Notiz stay. */
export function notesLiveSkipsLlm(input: {
  message: string;
  isDemo?: boolean;
  train?: boolean;
  notes?: string | null;
  facts?: string[];
  hasPatient?: boolean;
}) {
  if (input.train) return false;
  return Boolean(
    notesLiveReply(
      input.message,
      { notes: input.notes ?? "", isDemo: Boolean(input.isDemo) },
      input.facts ?? [],
      Boolean(input.hasPatient),
    ),
  );
}

/** fillActionNames would put Fritz on the intern Zettel. Keep Patient when no Hausregel. */
export function notesEmptyDeskAction<T extends { type: string; pet?: string }>(
  action: T,
  message: string,
  desk: Pick<Desk, "notes" | "isDemo">,
  facts: string[] = [],
  hasPatient = false,
): T {
  if (!notesLiveReply(message, desk, facts, hasPatient)) return action;
  return { ...action, type: "none", pet: "Patient" };
}

export const OWNER_NAME_EMPTY_ERROR = "Bitte die Inhaberin eintragen.";

/** Settings Speichern. Empty `#ownerName` keeps the hinterlegte Inhaberin; never invent Huber. */
export function keepOwnerName(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 80);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 80);
}

/** Heute banner and live prompt: leftover empty / Frau-Doktor fallback is not hinterlegt. */
export function ownerIncomplete(name?: string | null) {
  const n = String(name ?? "").trim();
  if (!n) return true;
  return /^(die\s+)?frau\s+doktor$/i.test(n);
}

export function ownerSystemRule(desk: Pick<Desk, "owner">) {
  if (!ownerIncomplete(desk.owner)) return "";
  return `INHABERIN OHNE NAMEN: Erfinde keinen Namen, nenne nicht Dr. med. vet. Anna Huber und nicht Huber. Sage Frau Doktor. Die Tierarzthelferin trägt den Namen in den Einstellungen ein.`;
}

/** Caller asked who the Inhaberin is, not to connect or book. */
export function isOwnerAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t)) return false;
  return /wer ist (die )?(frau doktor|inhaberin)|wie heißt (die )?(frau doktor|inhaberin)|name der (frau doktor|inhaberin)|welche (ärztin|doktorin|inhaberin)/.test(
    t,
  );
}

/** Spoken Inhaberin from Einstellungen. Live never invents Anna Huber. */
export function ownerReply(desk: Pick<Desk, "owner" | "isDemo">) {
  if (desk.isDemo) {
    const name = String(desk.owner ?? "").trim();
    return name
      ? `Die Inhaberin ist ${name}.`
      : "Die Inhaberin ist die Frau Doktor.";
  }
  if (ownerIncomplete(desk.owner)) {
    return "Die Inhaberin ist die Frau Doktor. Ein Name ist noch nicht hinterlegt.";
  }
  return `Die Inhaberin ist ${desk.owner.trim()}.`;
}

/** Caller asks what something costs. Silvia never invents a price/Euro figure. */
export function isPriceAsk(message: string) {
  const t = message.toLowerCase();
  return /kost|preis|gebühr|wie teuer|wieviel.{0,4}(kostet|zahlen)/.test(t);
}

/** Canned no-price reply — the Frau Doktor names a price, never Silvia. */
export function priceReply(desk: Pick<Desk, "owner">): string {
  return `Den genauen Preis nennt ${desk.owner || "die Frau Doktor"} im Termin oder am Telefon. Soll ich Ihnen einen Termin vormerken?`;
}

/** Caller asked the Ordinationsname, not a booking. */
export function isPracticeAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t)) return false;
  return /wie heißt (die )?(ordination|praxis)|name der ordination|welche ordination/.test(
    t,
  );
}

/** Spoken Ordinationsname from der Tafel. Live never invents Huber. */
export function practiceReply(desk: Pick<Desk, "name" | "isDemo">) {
  const name = String(desk.name ?? "").trim();
  if (name) return `Das ist ${name}.`;
  if (desk.isDemo) return "Das ist die Ordination Huber.";
  return "Ein Ordinationsname ist noch nicht hinterlegt. Die Tierarzthelferin trägt ihn in den Einstellungen ein.";
}

/** Kassa Inhaberin on Heute. Name required. Never invent Anna Huber. */
export function parsePracticeOwnerName(
  input?: { name?: string } | string | null,
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = typeof input === "string" || input == null ? input : input.name;
  const name = String(raw ?? "")
    .trim()
    .slice(0, 80);
  if (ownerIncomplete(name))
    return { ok: false, error: OWNER_NAME_EMPTY_ERROR };
  return { ok: true, value: name };
}

/** Heute Ort hinterlegen. Empty Bundesland keeps the typed Land; never invent Wien. */
export function keepBundesland(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 40);
  if (next && (BUNDESLAENDER as readonly string[]).includes(next)) return next;
  const prev = String(current ?? "")
    .trim()
    .slice(0, 40);
  if ((BUNDESLAENDER as readonly string[]).includes(prev)) return prev;
  return "";
}

export function isDirectoryNachtdienstPlace(name?: string | null) {
  const n = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  return NACHTDIENSTE.some((entry) => entry.place.trim().toLowerCase() === n);
}

export function isPlaceholderNachtdienstName(name?: string | null) {
  const n = String(name ?? "").trim();
  if (!n) return true;
  return /bitte hinterlegen/i.test(n);
}

/** Directory leftovers without a number are not hinterlegt. Typed Kliniknamen stay. */
export function spokenNachtdienstDest(name: string, phone = "") {
  const trimmed = name.trim();
  if (isPlaceholderNachtdienstName(trimmed)) return "";
  if (!phone.trim() && isDirectoryNachtdienstPlace(trimmed)) return "";
  return trimmed;
}

function spokenNachtdienstExtra(note: string) {
  if (isPlaceholderNachtdienstNote(note)) return "";
  return ` ${note.trim().replace(/[.!?]+$/, "")}.`;
}

export function emergencySpoken(desk: Desk) {
  const dest = spokenNachtdienstDest(
    desk.nachtdienstName,
    desk.nachtdienstPhone,
  );
  const phone = desk.nachtdienstPhone.trim();
  const extraNote = spokenNachtdienstExtra(desk.nachtdienstNote);
  if (phone) {
    const name = dest || "Nachtdienst";
    if (desk.isDemo) {
      return `Das klingt nach einem Notfall – bitte sofort handeln, nicht warten. Ich verbinde Sie mit dem Nachtdienst, dem ${name}, unter ${phone}.${extraNote} Ich bleibe in der Leitung, bis die Übernahme bestätigt ist.`;
    }
    return `Das klingt nach einem Notfall – bitte nicht warten. Der Nachtdienst ist ${name} unter ${phone}.${extraNote} Bleiben Sie in der Leitung. Die Tierarzthelferin ruft dort an – Silvia verbindet nicht selbst.`;
  }
  if (dest) {
    return `Das klingt nach einem Notfall – bitte nicht warten. Hinterlegt ist ${dest}, eine Nummer fehlt aber.${extraNote} Bleiben Sie in der Leitung. Die Tierarzthelferin trägt sie in den Einstellungen ein – Silvia verbindet nicht selbst.`;
  }
  return `Das klingt nach einem Notfall – bitte nicht warten. Eine Nachtdienst-Nummer ist noch nicht hinterlegt.${extraNote} Bleiben Sie in der Leitung. Die Tierarzthelferin trägt sie in den Einstellungen ein – Silvia verbindet nicht selbst.`;
}

export function nachtdienstSystemRule(desk: Desk) {
  if (desk.nachtdienstPhone.trim()) return "";
  return `NACHDIENST OHNE NUMMER: Erfinde keine Telefonnummer und nenne nicht die Vetmeduni Wien. Sage nicht, dass du verbindest. Sage, dass die Nummer in den Einstellungen fehlt, die Anruferin in der Leitung bleiben soll, und die Tierarzthelferin die Nummer hinterlegt.`;
}

/** Caller asked where to call at night — not an emergency symptom. */
export function isNachtdienstTurn(message: string) {
  const t = message.toLowerCase();
  if (
    /atem|schnauf|blau|blut|krampf|gift|unfall|bewusstlos|aufgebläht|stachel|geburt/.test(
      t,
    )
  ) {
    return false;
  }
  return /nachtdienst|nachts (an)?rufen|tierklinik|notdienst|außerhalb (der |euer )?zeiten|vetmeduni/.test(
    t,
  );
}

/** Spoken Nachtdienst from hinterlegte Stelle/Nummer. Live never invents Vetmeduni Wien. */
export function nachtdienstReply(desk: Desk) {
  const dest = spokenNachtdienstDest(
    desk.nachtdienstName,
    desk.nachtdienstPhone,
  );
  const phone = desk.nachtdienstPhone.trim();
  const extra = spokenNachtdienstExtra(desk.nachtdienstNote);
  if (phone) {
    const name = dest || "Nachtdienst";
    if (desk.isDemo) {
      return `Außerhalb der Zeiten ist der Nachtdienst ${name} unter ${phone}.${extra} Bei einem Notfall verbinde ich.`;
    }
    return `Außerhalb der Zeiten ist der Nachtdienst ${name} unter ${phone}.${extra} Bei einem Notfall bleibt die Klientel in der Leitung, die Tierarzthelferin ruft dort an.`;
  }
  if (dest) {
    return `Hinterlegt ist ${dest}, eine Nummer fehlt aber.${extra} Die Tierarzthelferin trägt sie in den Einstellungen ein. Silvia erfindet keine Kliniknummer und verbindet nicht selbst.`;
  }
  return `Eine Nachtdienst-Nummer ist noch nicht hinterlegt.${extra} Die Tierarzthelferin trägt sie in den Einstellungen ein. Silvia erfindet keine Vetmeduni und keine Kliniknummer.`;
}

export function holidayNachtdienstLine(desk: Desk) {
  const name =
    spokenNachtdienstDest(desk.nachtdienstName, desk.nachtdienstPhone) ||
    "den hinterlegten Nachtdienst";
  if (desk.nachtdienstPhone.trim()) {
    return `Der Nachtdienst läuft über ${name}.`;
  }
  return `Der Nachtdienst (${name}) hat noch keine Nummer hinterlegt.`;
}

/** Statutory AT Feiertage. Same names the Kalender already closes; Nachtdienst stays hinterlegt. */
export function holidayReply(desk: Desk) {
  const names = AT_HOLIDAYS.filter(
    (h) => h.name !== "Nationalfeiertag" && h.name !== "Heiliger Abend",
  ).map((h) => h.name);
  const last = names.at(-1) ?? "Stefanitag";
  const lead = names.slice(0, -1).join(", ");
  return `Am Nationalfeiertag, den 26. Oktober, bleibt die Ordination geschlossen. Dasselbe gilt für ${lead} und den ${last}. Heiliger Abend ist ab Mittag zu. Karfreitag ist bei uns kein gesetzlicher Feiertag. ${holidayNachtdienstLine(desk)} Am nächsten Werktag sind wir wieder für Sie da.`;
}

/** Live Feiertag is a Tafel rule — skip the model. Schulung stays on the model. */
export function holidaySkipsLlm(input: { message: string; train?: boolean }) {
  if (input.train) return false;
  return isHolidayAsk(input.message);
}

export function addressLine(
  desk: Pick<Desk, "street" | "zip" | "city" | "name">,
) {
  return (
    [desk.street, [desk.zip, desk.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ") || desk.name
  );
}

/** Huber demo only. Live tenants use the Anreise from Einstellungen, never Josefstadt. */
export function travelReply(desk: Desk) {
  if (desk.isDemo) {
    return `In den Wiener Linien braucht der Hund Leine und Maulkorb, außer er fährt in der Box. Steigen Sie an der U2 Rathaus aus, dann die Josefstädter Straße zu Fuß – wir sind im achten Bezirk, Nummer 28. Vor der Tür ist Kurzparkzone, Mo bis Fr Parkpickerl oder Ticket.`;
  }
  const where = desk.locationHint.trim() || addressLine(desk);
  const wien = /wien/i.test(desk.city) || desk.zip.startsWith("1");
  const oeffi = wien
    ? "Für die Wiener Linien braucht der Hund Leine und Maulkorb, außer er fährt in der Box."
    : "Für öffentliche Verkehrsmittel gilt in Österreich: Hund an der Leine, in Wien zusätzlich Maulkorb außer in der Box.";
  return `Wir sind ${where}. ${oeffi}`;
}

export function isTravelTurn(message: string) {
  return /maulkorb|u-bahn|u2|öffi|wiener linien|anreise|parken|parkpickerl|parkplätz|wie komm(e|t)? ich/.test(
    message.toLowerCase(),
  );
}

/** Anreise/Parken is a Tafel rule — skip the model. Schulung stays on the model. Demo uses travelReply Huber. */
export function travelSkipsLlm(input: { message: string; train?: boolean }) {
  if (input.train) return false;
  return isTravelTurn(input.message);
}

function isDeskTicketAsk(message: string) {
  return /termin|impfung|kastration|kontrolle|lahm|rückruf|verbinden/.test(
    message.toLowerCase(),
  );
}

/** Caller asked for the street/Ort, not Parken and not a Termin. */
export function isAddressAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t) || isTravelTurn(t)) return false;
  return /adresse|anschrift|wo (seid ihr|liegt (ihr|die ordination)|sitzt ihr)|wo findet man euch|welche straße|eure straße|ihre straße/.test(
    t,
  );
}

/** Spoken Adresse from hinterlegte Straße/Ort. Live never invents Josefstadt. */
export function addressReply(desk: Desk) {
  const line = addressLine(desk);
  if (desk.isDemo) {
    return `Wir sind ${line}.`;
  }
  const hint = desk.locationHint.trim();
  if (line && hint && hint !== line) return `Wir sind ${line}. ${hint}`;
  if (line) return `Wir sind ${line}.`;
  return "Eine Adresse ist noch nicht hinterlegt. Die Tierarzthelferin trägt Straße und Ort in den Einstellungen ein.";
}

export function isWhatsappAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t) || /nachtdienst/.test(t)) return false;
  return /whatsapp/.test(t);
}

export function isLeitungAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t) || /nachtdienst|whatsapp/.test(t)) return false;
  return /telefonnummer|rufnummer|festnetznummer|eure nummer|ihre nummer|unter welcher nummer|wie lautet (eure|ihre|die) nummer|kann ich euch anrufen|habt ihr (eine |ein )?telefon/.test(
    t,
  );
}

export function isContactAsk(message: string) {
  return isWhatsappAsk(message) || isLeitungAsk(message);
}

/** Caller asked for the Ordination inbox, not their own Halterin-Mail. */
export function isInboxAsk(message: string) {
  const t = message.toLowerCase();
  if (isDeskTicketAsk(t) || /meine e-?mail|meine mail/.test(t)) return false;
  return /eure e-?mail|ihre e-?mail|habt ihr (eine )?e-?mail|wie lautet (eure|ihre|die) (e-?mail|inbox)|ordination.{0,20}e-?mail|e-?mail der (frau doktor|ordination)|inbox/.test(
    t,
  );
}

/** Spoken Inbox from Einstellungen `#email`. Live never names Anmelden or Huber. */
export function inboxReply(desk: Desk) {
  if (desk.isDemo) {
    const demo = String(desk.email ?? "").trim();
    return demo
      ? `Unsere E-Mail ist ${demo}.`
      : "Eine Inbox ist noch nicht hinterlegt.";
  }
  const inbox = internPracticeInbox(desk.email);
  if (inbox) return `Unsere E-Mail ist ${inbox}.`;
  return "Eine Inbox ist noch nicht hinterlegt. Die Tierarzthelferin trägt sie in den Einstellungen ein.";
}

/** Spoken Leitung/WhatsApp from hinterlegte Nummern. Live never names Festnetz as WhatsApp or invents Huber. */
export function contactReply(desk: Desk, message = "") {
  const phone = String(desk.phone ?? "").trim();
  const wa = deskWhatsappNumber(desk);
  const waOnly = isWhatsappAsk(message) && !isLeitungAsk(message);
  if (waOnly) {
    if (wa) return `WhatsApp erreichen Sie uns unter ${wa}.`;
    if (phone) {
      return `WhatsApp ist noch nicht hinterlegt. Sie erreichen uns telefonisch unter ${phone}.`;
    }
    return "WhatsApp ist noch nicht hinterlegt. Eine Leitungsnummer fehlt ebenfalls.";
  }
  if (isLeitungAsk(message) && !isWhatsappAsk(message)) {
    if (phone) return `Unsere Leitung ist ${phone}.`;
    return "Eine Leitungsnummer ist noch nicht hinterlegt.";
  }
  const bits = [
    phone ? `Telefon ${phone}` : "Telefon nicht hinterlegt",
    wa ? `WhatsApp ${wa}` : "WhatsApp nicht hinterlegt",
  ];
  return `Sie erreichen uns unter ${bits.join(", ")}.`;
}

/** Caller asked about a Feiertag, not a booking on that day. */
export function isHolidayAsk(message: string) {
  const t = message.toLowerCase();
  if (/termin|impfung|kastration|kontrolle|lahm|rückruf|verbinden/.test(t))
    return false;
  return /nationalfeiertag|26\.?\s*oktober|feiertag|fronleichnam|empfängnis|stefani|karfreitag|ostermontag|himmelfahrt|pfingst|heilige drei könige|neujahr|staatsfeiertag|allerheiligen|weihnacht/.test(
    t,
  );
}

/** Live Auskunft Silvia already answers from hinterlegte Zeilen. */
export function isLiveInfoTurn(message: string) {
  return (
    isHoursTurn(message) ||
    isTravelTurn(message) ||
    isNachtdienstTurn(message) ||
    isHolidayAsk(message) ||
    isAddressAsk(message) ||
    isContactAsk(message) ||
    isInboxAsk(message) ||
    isOwnerAsk(message) ||
    isPracticeAsk(message)
  );
}

/**
 * After replacing invented Huber text, `#sprechen-llm-source` stays Lokal.
 * Schulung stays Modell. Demo keeps Huber for Adresse/Kontakt/Inbox/Inhaberin/Name.
 */
export function liveInfoOverwriteIsLocal(input: {
  message: string;
  isDemo?: boolean;
  train?: boolean;
  actionType?: string;
}) {
  if (input.train) return false;
  const last = String(input.message ?? "");
  if (input.actionType === "emergency") return true;
  if (isNachtdienstTurn(last)) return true;
  if (isHoursTurn(last)) return true;
  if (input.isDemo) return false;
  return (
    isAddressAsk(last) ||
    isContactAsk(last) ||
    isInboxAsk(last) ||
    isOwnerAsk(last) ||
    isPracticeAsk(last)
  );
}

/** Policy/price/species leftover — not Hallo, not a book. */
export function isLeftoverPolicyAsk(message: string) {
  if (!isLeftoverAuskunft(message)) return false;
  return /nehmt ihr|habt ihr|macht ihr|könnt ihr|was kostet|welche tiere|kaninchen|meerschwein|vogel|reptil|exot|preise?|tarif|hausregel/i.test(
    message,
  );
}

/** Live leftover policy ask. No Verbindung, no invented slot. */
export function leftoverReply() {
  return "Dazu ist keine Hausregel hinterlegt. Die Tierarzthelferin trägt sie auf Heute oder in den Einstellungen ein. Für Termin, Öffnungszeiten oder den Nachtdienst helfe ich gerne. Silvia verbindet niemanden selbst.";
}

/** Live leftover policy is a Tafel rule — skip the model. Demo stays Huber. Schulung stays on the model. */
export function leftoverSkipsLlm(input: {
  message: string;
  isDemo?: boolean;
  train?: boolean;
}) {
  if (input.train || input.isDemo) return false;
  return isLeftoverPolicyAsk(input.message);
}

/** Staff live persist skipped intern — Anrufe, not an empty Protokoll. */
export const AUSKUNFT_ANRUFE_NOTE = "Auskunft liegt unter Anrufe.";

/** After live persist: leftover/info skip intern → Anrufe. Book/protocol stay on the Tafel. Emergency is handled separately. */
export function livePersistStaffNote(input: {
  internSkipped: boolean;
  actionType: string;
  pet?: string;
}): { note: string; links: "anrufe" | "tafel"; toastSuccess?: string } | null {
  if (input.actionType === "emergency") return null;
  if (input.internSkipped) {
    return { note: AUSKUNFT_ANRUFE_NOTE, links: "anrufe" };
  }
  if (input.actionType === "book") {
    const named = Boolean(input.pet && input.pet !== "Patient");
    return {
      note: named
        ? `Termin für ${input.pet} liegt auf der Tafel.`
        : "Termin liegt auf der Tafel.",
      links: "tafel",
      toastSuccess: named
        ? `Termin für ${input.pet} liegt.`
        : "Termin liegt auf der Tafel.",
    };
  }
  return { note: "Protokoll liegt auf der Praxistafel.", links: "tafel" };
}

/** Live leftover Auskunft — not a book, not hinterlegte Info, not Rückruf/Kassa/Notfall. */
export function isLeftoverAuskunft(message: string) {
  const t = String(message ?? "");
  if (!t.trim()) return false;
  if (wantsAppointment(t) || isNotesBookingTurn(t)) return false;
  if (isCallbackTurn("", t) || isKassaTransferTurn("", t)) return false;
  if (isLiveInfoTurn(t)) return false;
  if (/reise|ausweis|kroat|chip|hundeabgabe/i.test(t)) return false;
  if (
    /atem|schnauf|blau|blut|krampf|gift|unfall|bewusstlos|aufgebläht|stachel|geburt|notfall/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

/** No intern Zettel for live Auskunft, even when the model tagged type=book. Demo, Termin, Notfall, Rückruf and Kassa stay. */
export function skipLiveInternZettel(input: {
  message: string;
  actionType: string;
  kind?: string;
  isDemo?: boolean;
  notesSkip?: boolean;
  callback?: boolean;
  kassa?: boolean;
}) {
  if (input.isDemo) return false;
  // Ein Uhrzeitwunsch wird nie als Termin gebucht, soll aber für die
  // Tierarzthelferin sichtbar bleiben.
  if (/^terminwunsch$/i.test(input.kind ?? "")) return false;
  if (input.notesSkip) return true;
  if (input.actionType === "emergency" || input.actionType === "train")
    return false;
  if (input.callback || input.kassa) return false;
  if (/rückruf/i.test(input.kind ?? "") || /^kassa$/i.test(input.kind ?? ""))
    return false;
  if (input.actionType === "book" && !isLeftoverAuskunft(input.message))
    return false;
  return true;
}

/** Heute banner: without a street Silvia can only name the city. */
export function anreiseIncomplete(street?: string | null) {
  return !String(street ?? "").trim();
}

/** Heute banner: without a city Silvia must not fall back to Wien. */
export function ortIncomplete(city?: string | null) {
  return !String(city ?? "").trim();
}

export const ORT_CITY_EMPTY_ERROR = "Bitte den Ort eintragen.";
export const ORT_BUNDESLAND_INVALID_ERROR =
  "Bitte ein österreichisches Bundesland (oder leer).";
export const REGISTER_BUNDESLAND_EMPTY_ERROR = "Bitte ein Bundesland wählen.";

/** Signup: city and a valid AT Bundesland. Never invent Wien. Heute Ort stays for old Tafeln. */
export function parseRegisterPlace(input: {
  city?: string;
  bundesland?: string;
}):
  | { ok: true; city: string; bundesland: string }
  | { ok: false; error: string } {
  const city = String(input?.city ?? "")
    .trim()
    .slice(0, 60);
  const bundesland = String(input?.bundesland ?? "")
    .trim()
    .slice(0, 40);
  if (!city) return { ok: false, error: ORT_CITY_EMPTY_ERROR };
  if (!(BUNDESLAENDER as readonly string[]).includes(bundesland)) {
    return { ok: false, error: REGISTER_BUNDESLAND_EMPTY_ERROR };
  }
  return { ok: true, city, bundesland };
}

/** Kassa Ort on Heute. City required. Bundesland optional but must be AT if present. Never invent Wien. */
export function parsePracticeOrt(input: {
  city?: string;
  bundesland?: string;
}):
  | { ok: true; city: string; bundesland: string }
  | { ok: false; error: string } {
  const city = String(input?.city ?? "")
    .trim()
    .slice(0, 60);
  const bundesland = String(input?.bundesland ?? "")
    .trim()
    .slice(0, 40);
  if (!city) return { ok: false, error: ORT_CITY_EMPTY_ERROR };
  if (
    bundesland &&
    !(BUNDESLAENDER as readonly string[]).includes(bundesland)
  ) {
    return { ok: false, error: ORT_BUNDESLAND_INVALID_ERROR };
  }
  return { ok: true, city, bundesland };
}

export const PARKPLATZ_HINT_EMPTY_ERROR =
  "Bitte Parkplatz oder Öffi eintragen.";

/** Tierarzthelferin Parkplatz/Öffi on Heute. Hint required. Never invent Josefstadt or Kurzparkzone. */
export function parsePracticeLocationHint(input: {
  hint?: string;
}): { ok: true; hint: string } | { ok: false; error: string } {
  const hint = String(input?.hint ?? "")
    .trim()
    .slice(0, 400);
  if (!hint) return { ok: false, error: PARKPLATZ_HINT_EMPTY_ERROR };
  return { ok: true, hint };
}

export const ANREISE_STREET_EMPTY_ERROR = "Bitte die Straße eintragen.";
export const ANREISE_ZIP_INVALID_ERROR =
  "Bitte eine vierstellige PLZ (oder leer).";

/** Settings Speichern and Heute Anreise. Empty `#zip` keeps a hinterlegte vierstellige PLZ; both empty stay empty. Never invent 1080. */
export function keepZip(incoming?: string | null, current?: string | null) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 12);
  if (/^\d{4}$/.test(next)) return next;
  const prev = String(current ?? "")
    .trim()
    .slice(0, 12);
  return /^\d{4}$/.test(prev) ? prev : "";
}

/** Settings Speichern. Empty `#street` keeps the hinterlegte Straße; both empty stay empty. Never invent Josefstadt. */
export function keepStreet(incoming?: string | null, current?: string | null) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 80);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 80);
}

/** Settings Speichern. Empty `#city` keeps the hinterlegte Stadt; both empty stay empty. Never invent Wien. */
export function keepCity(incoming?: string | null, current?: string | null) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 60);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 60);
}

export const PRACTICE_NAME_EMPTY_ERROR =
  "Bitte den Namen der Ordination angeben.";

/** Settings Speichern. Empty `#name` keeps the hinterlegte Ordination; both empty stay empty. Never invent Huber. */
export function keepPracticeName(
  incoming?: string | null,
  current?: string | null,
) {
  const next = String(incoming ?? "")
    .trim()
    .slice(0, 80);
  if (next) return next;
  return String(current ?? "")
    .trim()
    .slice(0, 80);
}

/** Kassa Anreise on Heute and signup. Street required. Zip optional but 4 digits if present. Never invent Josefstadt. */
export function parsePracticeAnreise(input: {
  street?: string;
  zip?: string;
  hint?: string;
}):
  | { ok: true; street: string; zip: string; hint: string }
  | { ok: false; error: string } {
  const street = String(input?.street ?? "")
    .trim()
    .slice(0, 80);
  const zip = String(input?.zip ?? "")
    .trim()
    .slice(0, 12);
  const hint = String(input?.hint ?? "")
    .trim()
    .slice(0, 400);
  if (!street) return { ok: false, error: ANREISE_STREET_EMPTY_ERROR };
  if (zip && !/^\d{4}$/.test(zip))
    return { ok: false, error: ANREISE_ZIP_INVALID_ERROR };
  return { ok: true, street, zip, hint };
}

export function deskFromProfile(p: PracticeProfile): Desk {
  return {
    isDemo: false,
    name: p.name,
    shortName: shortPracticeName(p.name),
    owner: p.ownerName,
    street: p.street,
    zip: p.zip,
    city: p.city,
    bundesland: p.bundesland,
    phone: p.phone,
    whatsapp: p.whatsapp,
    email: p.email,
    hours: p.hours,
    nachtdienstName: spokenNachtdienstDest(
      p.nachtdienstName,
      p.nachtdienstPhone,
    ),
    nachtdienstPhone: p.nachtdienstPhone,
    nachtdienstNote: keepNachtdienstNote(p.nachtdienstNote),
    notes: p.notes,
    locationHint: (p.locationHint || "").trim(),
    consentEnabled: p.consentEnabled,
    consentNote: p.consentNote,
  };
}
