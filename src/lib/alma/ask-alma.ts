import { createServerFn } from "@tanstack/react-start";

/** Clientseitige Obergrenze: schützt die Bedienung bei verlorenem ServerFn-Transport. */
export const ASK_CLIENT_TIMEOUT_MS = 35_000;
import {
  cleanPatient,
  connectorPatientsFor,
  connectorSlotFor,
  mapConnectorPatient,
} from "./ask-alma-connector.ts";

// Die Connector-Anbindung liegt jetzt in ask-alma-connector.ts (Punkt 9 der
// Code-Durchsicht). Sie bleibt hier re-exportiert, damit bestehende Aufrufer
// und Tests unveraendert weiterlaufen.
export { connectorPatientsFor, connectorSlotFor, mapConnectorPatient };
import { isShortBookingConfirmation } from "@/lib/practice/appointment-confirmation";
import { dbBookingGuard, type BookingGuard } from "./booking-guard.ts";

/**
 * Punkt 13: dauerhafte Buchungssperre aus der Tafel-Datenbank.
 *
 * Ohne Datenbank (z. B. reine Funktionstests) bleibt der Arbeitsspeicher.
 */
async function bookingGuard(): Promise<BookingGuard> {
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  return dbBookingGuard(sql);
}
import {
  parseSilviaReply,
  fillActionNames,
  guessOwner,
  guessPet,
  type SilviaAction,
} from "./actions.ts";
import {
  addressReply,
  contactReply,
  demoDesk,
  deskContactLine,
  emergencySpoken,
  holidayReply,
  holidaySkipsLlm,
  inboxReply,
  isAddressAsk,
  isContactAsk,
  isHolidayAsk,
  isInboxAsk,
  isLeftoverPolicyAsk,
  isNachtdienstTurn,
  isOwnerAsk,
  isPlaceholderNachtdienstNote,
  isPracticeAsk,
  isPriceAsk,
  isTravelTurn,
  leftoverReply,
  leftoverSkipsLlm,
  leitungSystemRule,
  liveInfoOverwriteIsLocal,
  nachtdienstReply,
  nachtdienstSystemRule,
  notesEmptyDeskAction,
  notesLiveReply,
  notesLiveSkipsLlm,
  notesSystemRule,
  ortSystemRule,
  ownerReply,
  ownerSystemRule,
  parkplatzSystemRule,
  practiceReply,
  priceReply,
  spokenNachtdienstDest,
  travelReply,
  travelSkipsLlm,
  whatsappSystemRule,
  type Desk,
} from "./desk.ts";
import {
  deskStatusAt,
  formatSlot,
  hoursPauseCopy,
  hoursReply,
  hoursSystemRule,
  isHoursTurn,
  nextFreeSlotAt,
  parseHourWindows,
  viennaNow,
  type OccupiedSlot,
} from "./hours.ts";
import {
  identificationPrompt,
  identifyCaller,
  type ChatTurnLike,
  type IdentifyResult,
} from "./identify.ts";
import {
  CANCEL_WORDS,
  CLOSING_WORDS,
  GENERIC_FALLBACK_MARKER,
  RESCHEDULE_WORDS,
  TERMIN_TRIGGER,
  UNCLEAR_REPLY_TEXT,
  WRONG_NUMBER_WORDS,
  isUnclearUtterance,
  normalizeUtterance,
} from "./verstehen.ts";
import {
  KASSA_SPOKEN,
  alignSpokenDeskTicket,
  bookSkipsLlm,
  callbackSkipsLlm,
  callbackSpoken,
  contactFollowUpSkipsLlm,
  deskConfirmChannelCopy,
  guessEmail,
  guessPhone,
  isCallbackTurn,
  isContactOnlyTurn,
  isKassaTransferTurn,
  withContactAsk,
} from "./phone.ts";
import {
  PATIENTS,
  lookupPatient,
  patientBlurb,
  type Edition,
  type Patient,
} from "./patients.ts";
import { behaviorPromptBlock } from "./behavior.ts";
import { detectEmergency } from "@/lib/live/emergency";
import {
  extractTrainFact,
  learnedFactsFrom,
  learnedFactsSkipsLlm,
  learnedPromptBlock,
  replyFromLearnedFacts,
} from "./train.ts";
import {
  llmPatientPrompt,
  resolveLlm,
  type LlmProviderId,
} from "./llm.ts";
import type { LlmReplySource } from "./llm-source.ts";
import type { PraxissoftwarePort } from "@/lib/practice/praxissoftware";
import { appointmentPreference, nextLocalRequestedSlot } from "./appointment-preference.ts";
import { isStrictTrue } from "./strict-boolean.ts";

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Schulung ist nur in der Demo oder für eine angemeldete Ordination erlaubt. */
export function trainingModeAllowed({
  requested,
  demo,
  authenticated,
  inbound,
}: {
  requested: boolean;
  demo: boolean;
  authenticated: boolean;
  inbound: boolean;
}) {
  return requested && !inbound && (demo || authenticated);
}

function windowsFor(desk: Desk) {
  return parseHourWindows(desk.hours);
}

function slotFor(desk: Desk, occupied: OccupiedSlot[] = [], preferredDate?: string) {
  if (preferredDate) {
    const requested = nextLocalRequestedSlot(desk.hours, occupied, preferredDate);
    return requested ? formatSlot(requested) : "kein freier Slot am gewünschten Tag";
  }
  // Punkt 16: kein freier Termin wird als solcher benannt, statt eine
  // erfundene Uhrzeit zu nennen.
  const slot = nextFreeSlotAt(windowsFor(desk), occupied);
  return slot ? formatSlot(slot) : "kein freier Slot hinterlegt";
}

function statusFor(desk: Desk) {
  return deskStatusAt(windowsFor(desk), viennaNow(), desk.isDemo);
}

function hoursLines(desk: Desk) {
  return desk.hours.map((h) => `${h.day}: ${h.time}`).join("\n");
}

function vetLabel(desk: Desk) {
  return desk.owner || "der Frau Doktor";
}

function nachtdienstLine(desk: Desk) {
  const dest = spokenNachtdienstDest(
    desk.nachtdienstName,
    desk.nachtdienstPhone,
  );
  const phone = desk.nachtdienstPhone.trim();
  const note = isPlaceholderNachtdienstNote(desk.nachtdienstNote)
    ? ""
    : desk.nachtdienstNote.trim();
  const label = dest || (phone ? "Nachtdienst" : "nicht hinterlegt");
  return [label, phone, note].filter(Boolean).join(", ");
}

/**
 * Datenabgleich (Owner-Vorgabe, wie bei der Bank): solange nicht identifiziert,
 * bekommt das Modell keine Patientendaten in den Prompt — auch nicht in der
 * Sonderedition Akte. Notfall bleibt davon unberührt (nachtdienstSystemRule
 * steht immer im Prompt, unabhängig vom Datenabgleich).
 */
function akteFilesBlock(
  edition: Edition,
  identified: boolean,
  includeDemo: boolean,
  akteSource: Patient[],
): string {
  if (edition !== "akte") {
    return `STANDARD-Leitung: Du hast KEINE Patientenakte. Wenn jemand nach einem konkreten Tier fragt, sage ehrlich, dass du den Namen ohne die Sonderedition Akte nicht in der Kartei hast – du kannst trotzdem einen Slot legen. Nicht so tun, als kenntest du Gewicht oder letzte Impfung.`;
  }
  if (!identified) {
    return `SONDEREDITION AKTE ist aktiv, aber der DATENABGLEICH ist noch OFFEN. Du kennst die Kartei erst NACH dem Datenabgleich – lies keine Akte vor, nenne keinen Halternamen, kein Gewicht, keine Impfung, keine Hausregel, auch wenn ein Tiername fällt. Frage zuerst nach Name und Adresse oder Handynummer. Ausnahme: bei einem Notfall verbindest du sofort, ohne Datenabgleich.`;
  }
  if (includeDemo) {
    return `SONDEREDITION AKTE ist aktiv, der Datenabgleich ist erledigt. Du KENNST die Kartei. Wenn jemand nach Fritz fragt: das ist der Kater von Mag. Eva Berger. Er darf NUR in der Transportbox transportiert werden – nicht frei tragen, nicht in der Tasche. Lies letzter Besuch, Impfung, Hinweise der Tierarzthelferin, bevorzugter Slot. Erfinde nichts, was nicht in der Akte steht.
Akten:
${patientBlurb(akteSource)}`;
  }
  if (akteSource.length) {
    return `SONDEREDITION AKTE ist aktiv, der Datenabgleich ist erledigt. Du KENNST NUR die Kartei dieser Ordination. Erfinde keine Stammklientel (kein Fritz, kein Wastl aus einer anderen Ordination).
Akten:
${patientBlurb(akteSource)}`;
  }
  return `SONDEREDITION AKTE ist aktiv, die Kartei dieser Ordination ist aber noch leer. Du kennst keine Tiere. Sage ehrlich, dass noch kein Eintrag da ist, und lege trotzdem einen Slot. Erfinde keine Chipnummern.`;
}

function patientsForIdent(extra: Patient[], includeDemo: boolean): Patient[] {
  return includeDemo ? [...extra, ...PATIENTS] : extra;
}

function userTurn(content: string): ChatTurnLike {
  return { role: "user", content };
}

const ADDRESS_HINT =
  /\b\d{1,4}[a-z]?\s*,?\s*\d{4}\b|straße|strasse|\bgasse\b|\bweg\b|\bplatz\b/i;

/** Caller nannte einen Namen und eine adressähnliche Angabe, aber identifyCaller fand keine Akte. */
function looksLikeUnmatchedIdentification(
  spoken: string,
  ident: IdentifyResult,
): boolean {
  if (ident.identified) return false;
  if (guessOwner(spoken) === "Klientel") return false;
  return ADDRESS_HINT.test(spoken);
}

function newContactAction(message: string): SilviaAction {
  return {
    type: "none",
    owner: "Klientel",
    pet: "Patient",
    kind: "Neuaufnahme",
    concern: message.slice(0, 180),
    summary: "Noch nicht angelegt, Neuaufnahme.",
  };
}

/** A failed or uncertain connector write must never be represented as booked. */
export function localActionAfterBookingFailure(
  action: SilviaAction,
  connectorStart: string,
  uncertain = false,
): SilviaAction {
  return {
    ...action,
    type: "none",
    kind: "Termin",
    summary: uncertain ? "Buchung nicht bestätigt" : "Nicht eingetragen",
    connectorStart,
    connectorApplied: false,
  };
}

/** Ein paralleler Buchungsturn darf weder als Buchung noch als Fallback-Aktion gemeldet werden. */
export function localActionWhileBookingPending(action: SilviaAction): SilviaAction {
  return {
    ...action,
    type: "none",
    kind: "Termin",
    summary: "Buchung wird verarbeitet",
    connectorStart: "",
    connectorApplied: false,
  };
}

/** Datenabgleich ohne Treffer: nicht wie eine bestehende Akte behandeln, keine fremde Akte zeigen. */
function newContactReply(message: string): {
  text: string;
  action: SilviaAction;
} {
  return {
    text: "Danke. Sie sind noch nicht bei uns angelegt – ich nehme Sie neu auf. Um welches Tier geht es?",
    action: newContactAction(message),
  };
}

/** Datenabgleich offen, aber ein bekanntes Tier wurde genannt: keine Akte, erst identifizieren. */
function identificationPromptReply(
  message: string,
  patient: Patient,
): { text: string; action: SilviaAction } {
  return {
    text: identificationPrompt(),
    action: {
      type: "none",
      owner: "Klientel",
      pet: patient.name,
      kind: "Datenabgleich",
      concern: message.slice(0, 180),
      summary: "",
    },
  };
}

/**
 * Owner-Vorgabe (wie bei der Bank): Akte oder Terminbestätigung für eine
 * bekannte Halterin erst nach Datenabgleich. Notfälle bypassen das (localReply
 * gibt vorher schon zurück), allgemeine Auskünfte laufen ungehindert weiter,
 * weil dieses Gate erst unmittelbar vor der Akte/Buchungs-Antwort greift.
 */
function identificationGate(
  message: string,
  spoken: string,
  patient: Patient | null,
  ident: IdentifyResult,
  demoCallerNumber = false,
): { text: string; action: SilviaAction } | null {
  if (ident.identified) return null;
  if (looksLikeUnmatchedIdentification(spoken, ident))
    return newContactReply(message);
  if (ident.namedOwner) return namedOwnerReply(message, ident.namedOwner, demoCallerNumber);
  if (!patient) return null;
  return identificationPromptReply(message, patient);
}

/** Name bekannt, Adresse oder Handynummer fehlt noch: gezielt nachfragen, keine Akte. */
function namedOwnerReply(
  message: string,
  owner: string,
  demoCallerNumber = false,
): { text: string; action: SilviaAction } {
  return {
    text: identificationPrompt(salutationFor(owner), demoCallerNumber),
    action: {
      type: "none",
      owner: "Klientel",
      pet: "Patient",
      kind: "Datenabgleich",
      concern: message.slice(0, 180),
      summary: "",
    },
  };
}

const FEMALE_FIRST_NAME_HINT = /[ae]$/i;

/** "Mag. Eva Berger" -> "Frau Berger" für die einmalige Datenabgleich-Bestätigung. */
function salutationFor(owner: string): string {
  const trimmed = String(owner ?? "").trim();
  if (/^(frau|herr|familie)\s+/i.test(trimmed)) return trimmed;
  const withoutTitle = trimmed.replace(/^(mag\.?|dr\.?|ing\.?|di)\s+/i, "");
  const parts = withoutTitle.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const surname = parts.at(-1) ?? trimmed;
  const gender = FEMALE_FIRST_NAME_HINT.test(first) ? "Frau" : "Herr";
  return `${gender} ${surname}`;
}

/** Silvia darf den Datenabgleich einmal bestätigen — nur im Moment des Erkennens. */
function identConfirmationPrefix(
  justIdentified: boolean,
  owner?: string,
): string {
  if (!justIdentified || !owner) return "";
  return `Danke, ${salutationFor(owner)}, ich hab Sie. `;
}

export function buildSystem(
  edition: Edition,
  kb: Patient[],
  desk: Desk,
  includeDemo: boolean,
  extras?: {
    facts?: string[];
    train?: boolean;
    occupied?: OccupiedSlot[];
    thirdParty?: boolean;
    /** Vquadrat freeSlots() hint, formatted like slotFor() — falls back when absent/null. */
    connectorSlot?: string | null;
    /** Datenabgleich (identify.ts): true erst nach Name + Adresse/Handynummer-Treffer. */
    identified?: boolean;
    identifiedOwner?: string;
    /** AP 51: Freitext der Inhaberin (practices.behavior), eigener Block nach den Fakten. */
    behavior?: string;
  },
) {
  const slot = extras?.connectorSlot ?? slotFor(desk, extras?.occupied);
  const status = statusFor(desk);
  const identified = Boolean(extras?.identified);
  const akteSource = llmPatientPrompt(
    includeDemo ? [...kb, ...PATIENTS] : kb,
    Boolean(extras?.thirdParty),
  );
  const files = akteFilesBlock(edition, identified, includeDemo, akteSource);

  const address = [desk.street, [desk.zip, desk.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const learned = learnedPromptBlock(extras?.facts ?? [], desk.notes);
  const behavior = behaviorPromptBlock(extras?.behavior);
  // Wissenstraining läuft bewusst mit einem kleinen lokalen Prompt: Qwen soll
  // nur Ordinationsname, bereits gelernte Fakten und Verhalten verarbeiten.
  if (extras?.train) {
    return `Du bist Silvia und trainierst für die Ordination ${desk.name}.
Das ist ein internes Wissenstraining mit der Frau Doktor oder der Tierarzthelferin, kein Anruf mit Klientel. Lerne nur Fakten und gewünschtes Verhalten für diese Ordination. Es geht nicht um Klientel, Akten, Buchungen oder akute Fälle. Antworte natürlich, kurz und österreichisch: greife die letzte Aussage auf, bestätige knapp, was du verstanden hast, und frage bei Bedarf konkret nach. Bei einer Frage antworte aus dem bisher Gelernten oder frage gezielt nach; lege die Frage nicht automatisch als Fakt ab. Vertrauliche Daten bleiben lokal und werden nicht nach außen übermittelt.
${learned ? `${learned}\n` : ""}${behavior ? `${behavior}\n` : ""}
Schreibe immer zuerst eine sichtbare, vollständige Antwort für die Person. Schreibe nur diese Antwort: keine JSON-Daten, keine technische Markierung und keine internen Anweisungen.
Beispiel: Auf „Die Adresse ist Leopoldsgasse 12.“ antwortest du: „Verstanden, die Adresse ist Leopoldsgasse 12. Möchten Sie dazu noch etwas festlegen?“`;
  }

  return `Du bist Silvia, die KI-Rezeptionistin der ${desk.name}${address ? ` in ${address}` : ""}${desk.bundesland ? `, ${desk.bundesland}` : ""}.
Inhaberin: ${desk.owner || "die Frau Doktor"}. ${deskContactLine(desk)}
Anreise: ${desk.locationHint || address || desk.city}.

Ordinationszeiten:
${hoursLines(desk)}
${hoursPauseCopy(desk.hours)}
JETZT in der Ordination: ${status.label}. ${status.detail}
Nächster freier Slot: ${slot}. Nie an Feiertagen, nie außerhalb der hinterlegten Zeiten (außer Nachtdienst).

Ablauf des Gesprächs (immer gleich, wie bei der Bank): Begrüßung → Datenabgleich → Anliegen → Akte/Termin → Zusammenfassung. Akte und Termine erst nach Datenabgleich; Notfall sofort weiterverbinden, ohne auf den Datenabgleich zu warten.
Datenabgleich: ${identified ? `erledigt (${salutationFor(extras?.identifiedOwner || "")})` : "offen"}.
Wenn der Anrufer seinen Namen bereits genannt hat, frage ihn nicht erneut danach. Bitte nur noch um seine Adresse.
${includeDemo ? "Demo-Szenario: Sobald der Anrufername bekannt ist, darfst du sagen: In dieser Demo wird mir Ihre Handynummer simuliert angezeigt. Frage dann nur noch nach der Adresse. Die simulierte Rufnummer allein bestätigt keine Identität." : ""}

Nachtdienst: ${nachtdienstLine(desk)}
${nachtdienstSystemRule(desk)}
${whatsappSystemRule(desk)}
${leitungSystemRule(desk)}
${ortSystemRule(desk)}
${ownerSystemRule(desk)}
${notesSystemRule(desk, extras?.facts ?? [])}
${parkplatzSystemRule(desk)}
${hoursSystemRule(desk.hours, desk.isDemo)}
${learned ? `${learned}\n` : ""}
${behavior ? `${behavior}\n` : ""}
${files}

Stimme: erfahrene Rezeptionistin, seit Jahren am Apparat. Freundlich, knapp, Siezen. Kein Dialekt-Theater, kein „Oida“. Sage Grüß Gott oder Servus, nie „Guten Tag“ oder „Hallo“ als Begrüßung.

Wörter: Ordination (nie Praxis), Jänner (nie Januar), Handy (nie Mobiltelefon), Nachtdienst (nicht deutsches „Notdienst“ als Erstwort), Spital, Tierarzthelferin, Klientel, Frau Doktor, heuer, Stefanitag (nie „2. Weihnachtsfeiertag“). Karfreitag ist in Österreich kein gesetzlicher Feiertag.

Du darfst:
- Termine vorschlagen (nächster Slot: ${slot})
- Feiertage, Chip, Heimtierdatenbank, Anreise
- Hundeabgabe: das läuft über die Gemeinde (in Wien die MA 6) mit Chipnummer, nicht über die Ordination — die Chipnummer nimmst du auf, den Rest erklärt die Frau Doktor im Termin.
- Reise ins Ausland (EU): nötig sind ein gültiger EU-Heimtierausweis und eine aktuelle Tollwutimpfung — das prüft die Frau Doktor im Termin.
- WhatsApp-Fotos erbitten
- Notfälle sofort triagieren
- Wird eine falsche Nummer vermutet oder jemand fragt, wo er gelandet ist: den Namen der Ordination nennen (nicht nur „Silvia hier“).
- Will jemand einen bestehenden Termin verschieben oder absagen: das macht die Tierarzthelferin auf der Tafel, nicht Silvia selbst — sage das, biete keinen neuen Slot ohne Rückfrage an.
- Rückrufzettel an die Tierarzthelferin legen, wenn jemand zurückgerufen werden will. Die Nummer ist die der Halterin aus dem Gespräch, nie „fehlt in den Einstellungen“ (das gilt nur für Nachtdienst). Sage nicht, du legst 15:00. Sage nicht, du hast ein Tier notiert, wenn keines genannt wurde.
- Mit der Tierarzthelferin verbinden, wenn jemand „mit einem Menschen“ will. Sage: „Ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung.“ Sage nicht, du kannst nicht verbinden, und lege keinen Rückrufzettel — die Klientel bleibt in der Leitung.
- Beim Termin Name und Nummer der Halterin erfragen (Handy für WhatsApp, Festnetz für SMS), damit die Tierarzthelferin SMS oder WhatsApp als Entwurf öffnen kann. Eine E-Mail darf sie auch nennen – die Tierarzthelferin öffnet dann mailto, Silvia sendet nicht selbst.

Du darfst NICHT diagnostizieren, Medikamente empfehlen oder amtliche Meldungen durchführen.

Du nennst NIE einen Preis oder eine Eurosumme, auch nicht ungefähr — Preise erfindest du nicht. Bei einer Preisfrage: das sagt die Frau Doktor im Termin oder am Telefon, biete stattdessen einen Termin an.

Antworte IMMER auf Deutsch (Österreichisch), auch wenn die Anruferin auf Englisch oder einer anderen Sprache fragt. Kein Englisch, keine Übersetzung.

Notfall (sofort Nachtdienst): Atemnot, blaue/sehr blasse Schleimhäute, starke Blutung, Krampfanfall, Bewusstlosigkeit, aufgeblähter Bauch beim Hund, Giftköder, Stachel im Maul mit Schwellung, Geburtsprobleme, Trauma nach Autounfall, anhaltendes Erbrechen mit Apathie.

Antworten: 2–5 kurze Sätze, keine Listen außer Öffnungszeiten. Keine Emojis. Keine Markdown-Überschriften.

PFLICHT am Ende, eigene Zeile, niemals vorlesen:
<<ACTION{"type":"book|emergency|none","owner":"...","pet":"...","kind":"...","concern":"...","summary":"...","species":"Hund|Katze","chip":"","akteNote":"was der Anrufer gesagt hat, ein Satz"}>>
type=book wenn du einen Termin legst. type=emergency bei Notfall. sonst none.
akteNote: immer füllen, wenn ein Tier genannt wird – das landet in der Wissensdatenbank. Keine Diagnose, nur das Gesagte.
Wenn du einen Termin legst und Name oder Nummer noch fehlen: frage in einem Satz danach. Sage ehrlich, dass Silvia nicht selbst schickt – die Tierarzthelferin öffnet SMS, WhatsApp oder E-Mail. Bei einer Festnetznummer geht WhatsApp nicht, nur SMS oder E-Mail. Wird eine Nummer, eine E-Mail oder ein Name genannt, wiederhole sie.`;
}

/** Anruferin verabschiedet sich (pfiat di, baba, das wars, ...) – kein neuer Termin. */
function closingReply(): string {
  return "Danke, auf Wiederhören.";
}

/** Vermutlich falsch verbunden – Ordinationsname nennen, nicht nur "Silvia hier". */
function wrongNumberReply(desk: Desk): string {
  return `Hier ist die ${desk.name}${desk.city ? ` in ${desk.city}` : ""}. Falls Sie sich verwählt haben, ist das kein Problem. Auf Wiederhören.`;
}

/** Zu kurz/unklar ("Was?", "Wie bitte?") – nachfragen statt raten. */
function unclearReply(): string {
  return UNCLEAR_REPLY_TEXT;
}

/** Bestehenden Termin verschieben/absagen macht die Tierarzthelferin auf der Tafel, nicht Silvia selbst. */
function existingBookingReply(action: "verschieben" | "absagen"): string {
  const verb = action === "verschieben" ? "Verschieben" : "Absagen";
  return `Das ${verb} trägt die Tierarzthelferin auf der Tafel ein, ich lege dafür keinen neuen Termin ohne Rückfrage an. Für den Datenabgleich brauche ich noch Ihren Namen und die Adresse oder Handynummer, unter der Sie bei uns sind.`;
}

/** Eine Datums-/Zeitangabe nach bestehender Bestätigung ist eine Änderung,
 * keine neue Buchungsanfrage. So bleibt der bestätigte Termin unverändert,
 * bis die Tierarzthelferin ihn auf der Tafel verschiebt. */
export function isConfirmedAppointmentCorrection(message: string): boolean {
  const value = String(message ?? "").trim().replace(/[.!?]+$/, "").trim();
  // Nur vollständige Berichtigungen, keine beliebigen Sätze mit einer Uhrzeit.
  const day = "(?:heute|morgen|übermorgen)";
  if (new RegExp(`^(?:bitte\\s+)?${day}\\s+statt\\s+${day}$`, "i").test(value)) return true;
  if (new RegExp(`^(?:nicht\\s+)?${day}\\s*,?\\s+sondern\\s+${day}$`, "i").test(value)) return true;
  return /^(?:bitte\s+)?(?:um\s+(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:\s+Uhr)?|(?:am\s+)?(?:Vormittag|Nachmittag))$/i.test(value);
}

function akteReply(p: Patient, slot: string): string {
  const bits = [
    `${p.name}, ${p.breed} von ${p.owner}.`,
    p.lastVisit ? `Zuletzt ${p.lastVisit}.` : "",
    `Impfung ${p.lastVaccine}, Tollwut ${p.rabies}.`,
    p.warnings ?? "",
    p.nextDue ? `Als Nächstes: ${p.nextDue}.` : "",
    `Soll ich ${slot} legen?`,
  ].filter(Boolean);
  return bits.join(" ");
}

export function localReply(
  message: string,
  extra: Patient[],
  edition: Edition,
  desk: Desk = demoDesk(),
  includeDemo = true,
  train = false,
  facts: string[] = [],
  priorUser = "",
  occupied: OccupiedSlot[] = [],
  connectorSlot: string | null = null,
  preferredDate?: string,
): { text: string; action: SilviaAction } {
  if (train) {
    const fact = extractTrainFact(message) || message.slice(0, 240);
    return {
      text: `Verstanden – ${fact}. Was möchten Sie dazu noch festlegen oder besprechen?`,
      action: {
        type: "train",
        owner: desk.owner || "Frau Doktor",
        pet: "",
        kind: "Schulung",
        concern: message.slice(0, 180),
        summary: fact,
        fact,
      },
    };
  }
  const t = normalizeUtterance(message);
  const spoken = `${priorUser} ${message}`.trim();
  const patient = lookupPatient(spoken, extra, { includeDemo });
  const inferredPet = patient?.name ?? guessPet(spoken, { includeDemo });
  const slot = connectorSlot ?? slotFor(desk, occupied, preferredDate);
  const identPatients = patientsForIdent(extra, includeDemo);
  const priorIdent = identifyCaller([userTurn(priorUser)], identPatients);
  const ident = identifyCaller(
    [userTurn(priorUser), userTurn(message)],
    identPatients,
  );
  const justIdentified = ident.identified && !priorIdent.identified;
  const confirmPrefix = identConfirmationPrefix(justIdentified, ident.owner);
  // Zwei unabhängige Erkennungen; im Zweifel Notfall (falsch-positiv ist harmlos).
  const emergency =
    detectEmergency(message).emergency ||
    /atem|keine luft|luft bekommt|schnauf|röchel|blau|blut(?!test|bild|unter|druck|abnahme|grupp|wert|probe)|krampf|gift|unfall|bewusstlos|aufgebläht|stachel|geburt(?!sdatum|stag|sjahr|sort)/.test(
      t,
    );
  if (emergency) {
    const text = emergencySpoken(desk);
    return {
      text,
      action: {
        type: "emergency",
        owner: patient?.owner ?? "Klientel",
        pet: inferredPet,
        kind: "Notfall",
        concern: message.slice(0, 180),
        summary: text.slice(0, 220),
      },
    };
  }
  const contactTurn = isContactOnlyTurn("none", message);
  if (contactTurn) {
    const handy = guessPhone(message);
    const mail = guessEmail(message);
    const ownerFromSpeech = fillActionNames(
      {
        type: "none",
        owner: patient?.owner ?? "Klientel",
        pet: inferredPet,
        kind: "Kontakt",
        concern: message,
        summary: "",
      },
      spoken,
      { includeDemo },
    ).owner;
    const owner = ownerFromSpeech;
    const label = owner !== "Klientel" ? owner.replace(/^Klientel\s+/i, "") : "";
    const stored = [label, handy, mail].filter(Boolean).join(", ");
    const contactLabel = handy ? "Ihre Handynummer" : mail ? "Ihre E-Mail-Adresse" : "Ihre Kontaktdaten";
    return {
      text: `Danke, ich habe ${contactLabel} erhalten. ${deskConfirmChannelCopy(handy)}`,
      action: {
        type: "none",
        owner,
        pet: inferredPet,
        kind: handy ? "Handy" : mail ? "E-Mail" : "Halterin",
        concern: message.slice(0, 180),
        summary: stored || message.slice(0, 220),
        akteNote: stored ? `Kontakt ${stored}` : message.slice(0, 220),
      },
    };
  }
  const notesLive = !includeDemo
    ? notesLiveReply(message, desk, facts, Boolean(patient))
    : null;
  if (notesLive) {
    return {
      text: notesLive,
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: notesLive.slice(0, 220),
      },
    };
  }
  const learned = replyFromLearnedFacts(
    message,
    learnedFactsFrom(facts, desk.notes),
  );
  if (learned) {
    return {
      text: learned,
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: learned.slice(0, 220),
      },
    };
  }
  if (isHolidayAsk(t) || /jänner/.test(t)) {
    return {
      text: holidayReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isTravelTurn(t)) {
    return {
      text: travelReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isAddressAsk(t)) {
    return {
      text: addressReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isContactAsk(t)) {
    return {
      text: contactReply(desk, t),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isInboxAsk(t)) {
    return {
      text: inboxReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isOwnerAsk(t)) {
    return {
      text: ownerReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isPracticeAsk(t)) {
    return {
      text: practiceReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isHoursTurn(t)) {
    return {
      text: hoursReply(desk.hours),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isNachtdienstTurn(t)) {
    return {
      text: nachtdienstReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (!includeDemo && isLeftoverPolicyAsk(t)) {
    return {
      text: leftoverReply(),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isCallbackTurn("", t)) {
    const who = lookupPatient(message, extra, { includeDemo });
    const action = {
      type: "none" as const,
      owner: who?.owner ?? guessOwner(spoken, { includeDemo }),
      pet: who?.name ?? inferredPet,
      kind: "Rückruf",
      concern: message.slice(0, 180),
      summary: "Rückrufbitte",
      akteNote: message.slice(0, 220),
    };
    return {
      text: callbackSpoken(action),
      action,
    };
  }
  if (isKassaTransferTurn("", t)) {
    const who = lookupPatient(message, extra, { includeDemo });
    return {
      text: KASSA_SPOKEN,
      action: {
        type: "none",
        owner: who?.owner ?? "Klientel",
        pet: who?.name ?? inferredPet,
        kind: "Kassa",
        concern: message.slice(0, 180),
        summary: "An die Tierarzthelferin übergeben",
        akteNote: message.slice(0, 220),
      },
    };
  }
  if (isPriceAsk(t)) {
    return {
      text: confirmPrefix + priceReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Preisfrage",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (CLOSING_WORDS.test(t)) {
    return {
      text: closingReply(),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Abschluss",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (WRONG_NUMBER_WORDS.test(t)) {
    return {
      text: wrongNumberReply(desk),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Info",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (isUnclearUtterance(message)) {
    return {
      text: unclearReply(),
      action: {
        type: "none",
        owner: "Klientel",
        pet: "Patient",
        kind: "Unklar",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (RESCHEDULE_WORDS.test(t)) {
    return {
      text: confirmPrefix + existingBookingReply("verschieben"),
      action: {
        type: "none",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Verschieben",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (CANCEL_WORDS.test(t)) {
    return {
      text: confirmPrefix + existingBookingReply("absagen"),
      action: {
        type: "none",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Absagen",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  const gate = identificationGate(message, spoken, patient, ident, includeDemo);
  if (gate) return gate;
  if (patient && edition !== "akte") {
    return {
      text:
        confirmPrefix +
        withContactAsk(
          `${patient.name} klingt bekannt – in der Standard-Leitung habe ich aber keine Akte. Mit der Sonderedition Akte wüsste ich Chip, letzte Impfung und was die Tierarzthelferin hinterlegt hat. Soll ich trotzdem ${slot} legen?`,
          spoken,
          { includeDemo },
        ),
      action: {
        type: "book",
        owner: patient.owner,
        pet: patient.name,
        kind: "Termin",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (patient) {
    return {
      text:
        confirmPrefix +
        withContactAsk(akteReply(patient, slot), spoken, { includeDemo }),
      action: {
        type: "book",
        owner: patient.owner,
        pet: patient.name,
        kind: patient.nextDue ?? "Kontrolle",
        concern: message.slice(0, 180),
        summary: "",
        akteNote: message.slice(0, 220),
        species: patient.species,
        chip: patient.chip,
      },
    };
  }
  if (
    /kroatien|italien|ungarn|slowenien|urlaub|eu-ausweis|heimtierausweis|tollwut/.test(
      t,
    )
  ) {
    return {
      text:
        confirmPrefix +
        withContactAsk(
          `Für die Reise brauchen Sie einen gültigen EU-Heimtierausweis und eine aktuelle Tollwutimpfung. Die Frau Doktor schaut das im Termin. Ich hätte ${slot} frei – passt Ihnen das, bevor Sie fahren?`,
          spoken,
          { includeDemo },
        ),
      action: {
        type: "book",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Reise / EU-Ausweis",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (/hundeabgabe|hundesteuer|ma 6|magistrat/.test(t)) {
    return {
      text:
        confirmPrefix +
        withContactAsk(
          `Die Hundeabgabe läuft über die Gemeinde, in Wien über die MA 6, mit Chipnummer. Wir sind die Ordination, nicht das Amt – aber die Chipnummer nehmen wir auf, und die Frau Doktor erklärt Ihnen den Rest im Termin. Soll ich einen Slot legen?`,
          spoken,
          { includeDemo },
        ),
      action: {
        type: "book",
        owner: "Klientel",
        pet: inferredPet !== "Patient" ? inferredPet : "Hund",
        kind: "Hundeabgabe",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (/impf|chip|heimtierregister|heimtierdatenbank/.test(t)) {
    return {
      text:
        confirmPrefix +
        withContactAsk(
          `Hunde müssen in Österreich gechippt und in der Heimtierdatenbank stehen. Für die jährliche Impfung habe ich ${slot} bei ${vetLabel(desk)}. Bitte Impfpass mitnehmen, die Chipnummer schauen wir gleich mit. Soll ich den Termin so eintragen?`,
          spoken,
          { includeDemo },
        ),
      action: {
        type: "book",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Impfung",
        concern: message.slice(0, 180),
        summary: "",
      },
    };
  }
  if (TERMIN_TRIGGER.test(t)) {
    const named = inferredPet !== "Patient";
    return {
      text:
        confirmPrefix +
        withContactAsk(
          named
            ? `Ich hätte einen Termin ${slot} bei ${vetLabel(desk)} frei, 20 Minuten für ${inferredPet}. Die Tierarzthelferin sieht den Termin auf der Tafel und bestätigt ihn.`
            : `Ich hätte einen Termin ${slot} bei ${vetLabel(desk)} frei, 20 Minuten. Die Tierarzthelferin bestätigt den Termin auf der Tafel. Wie heißt das Tier?`,
          spoken,
          { includeDemo },
        ),
      action: {
        type: "book",
        owner: "Klientel",
        pet: inferredPet,
        kind: "Termin",
        concern: message.slice(0, 180),
        summary: "",
        akteNote: message.slice(0, 220),
      },
    };
  }
  return {
    text:
      confirmPrefix +
      `Grüß Gott, Silvia von der ${desk.name}${desk.city ? ` in ${desk.city}` : ""}. ${GENERIC_FALLBACK_MARKER}. Erzählen Sie mir kurz, um welches Tier es geht und was Sie brauchen.`,
    action: {
      type: "none",
      owner: "Klientel",
      pet: "Patient",
      kind: "Info",
      concern: message.slice(0, 180),
      summary: "",
    },
  };
}


/**
 * Trainingskorpus (Owner-Wunsch): jede lokale Antwort, die nur der generische
 * Fallback oder "nicht verstanden" war, landet in verstehen-log.jsonl, damit
 * verstehen.corpus.ts / verstehen.ts / localReply aus echten Anrufen wachsen.
 * Dynamischer Import hält das Server-only-Modul aus dem Client-Bundle.
 * Läuft fire-and-forget (siehe Aufrufer) und wirft nie.
 */
async function logIfWeakReply(
  text: string,
  sagt: string,
  identified: boolean,
): Promise<void> {
  try {
    const { isWeakReply, appendVerstehenLog, verstehenLogPath } =
      await import("./verstehen-log");
    if (!isWeakReply(text)) return;
    await appendVerstehenLog(
      {
        ts: new Date().toISOString(),
        sagt,
        antwort: text,
        quelle: "local",
        identified,
      },
      verstehenLogPath(),
    );
  } catch {
    /* Trainingskorpus darf die Antwort nie verzögern oder abbrechen. */
  }
}


export const askAlma = createServerFn({ method: "POST" })
  .validator(
    (input: {
      messages: ChatTurn[];
      edition?: string;
      kb?: Partial<Patient>[];
      line?: string;
      demo?: boolean;
      train?: boolean;
      facts?: string[];
      confirmId?: string;
      /** AP 7d Teil 2: Anruf-Id fuer die Connector-Buchungs-Zustandsmaschine (booking.ts).
       * Leer/fehlend => wie bisher (keine Connector-Buchung, nur die Tafel-Vormerkung). */
      callId?: string;
    }) => {
      const messages = Array.isArray(input?.messages)
        ? input.messages.slice(-12)
        : [];
      const kb = Array.isArray(input?.kb)
        ? input.kb
            .slice(0, 16)
            .map(cleanPatient)
            .filter((p): p is Patient => Boolean(p))
        : [];
      const facts = Array.isArray(input?.facts)
        ? input.facts
            .map((f) => extractTrainFact(String(f ?? "")))
            .filter((f) => f.length >= 8)
            .slice(0, 40)
        : [];
      return {
        messages: messages.map((m) => ({
          role:
            m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: String(m.content ?? "").slice(0, 1200),
        })),
        edition:
          input?.edition === "standard"
            ? ("standard" as const)
            : ("akte" as const),
        kb,
        line: String(input?.line ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 48),
        demo: isStrictTrue(input?.demo),
        train: isStrictTrue(input?.train),
        facts,
        callId: String(input?.callId ?? "").slice(0, 80),
        confirmId: String(input?.confirmId ?? "").slice(0, 80),
      };
    },
  )
  .handler(async ({ data }) => {
    const { readPracticeSession } =
      await import("@/lib/practice/session.server");
    const session = data.demo ? null : await readPracticeSession();
    let desk = demoDesk();
    let kb = data.kb;
    let includeDemo = true;
    let facts = data.facts;
    const { fetchProfile, fetchProfileBySlug, loadPracticePatients } =
      await import("@/lib/practice/profile-data.server");
    const { deskFromProfile } = await import("./desk");
    let occupied: OccupiedSlot[] = [];
    let connectorSlot: string | null = null;
    let storedConfirmation: { id: string; practice_id: string; start_at: string | Date; status: string; owner_name: string; pet: string } | undefined;
    /** AP 7d Teil 2: nur gesetzt bei einem inbound-Anruf mit erreichbarem Connector — Grundlage fuer booking.ts. */
    let connectorAdapter: PraxissoftwarePort | null = null;
    const inbound =
      !data.demo && data.line ? await fetchProfileBySlug(data.line) : null;
    const staff =
      !inbound && session ? await fetchProfile(session.practiceId) : null;
    const profile = inbound ?? staff;
    // Die öffentliche Leitung darf nie per manipuliertem Browser-Request in
    // den Schulungsmodus wechseln. Trainieren bleibt einer angemeldeten Kassa
    // oder der Demo vorbehalten.
    const training = trainingModeAllowed({
      requested: data.train,
      demo: data.demo,
      authenticated: Boolean(session),
      inbound: Boolean(inbound),
    });
    const last =
      data.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const prior = data.messages
      .filter((m) => m.role === "user")
      .slice(0, -1)
      .map((m) => m.content)
      .join(" ");
    const preference = appointmentPreference(
      data.messages.filter((m) => m.role === "user").map((m) => m.content),
    );
    const preferredDate = preference?.kind === "date" ? preference.date : undefined;
    if (profile) {
      includeDemo = false;
      desk = deskFromProfile(profile);
      const { fetchFacts } = await import("@/lib/practice/facts.server");
      facts = (await fetchFacts(profile.id)).map((f) => f.fact);
      // Schulungen brauchen Praxiswissen, aber nie Patientenakten oder
      // Terminbelegungen. Dadurch bleiben diese Daten auch aus dem
      // Trainingskontext des lokalen Modells fern.
      if (!training) {
        kb = await loadPracticePatients(profile.id, `${prior} ${last}`.trim());
        const { getSql } = await import("@/lib/db.server");
        if (!data.demo && !inbound && data.confirmId) {
          const sql = await getSql();
          const rows = await sql<typeof storedConfirmation>`
            select id, practice_id, start_at, status, owner_name, pet
            from appointments
            where id = ${data.confirmId} and practice_id = ${profile.id}
            limit 1
          `;
          const { validStoredAppointment } = await import("@/lib/practice/appointment-confirmation");
          if (validStoredAppointment(rows[0], data.confirmId, profile.id)) storedConfirmation = rows[0];
        }
        const { loadOccupiedSlots } = await import("@/lib/practice/occupied");
        occupied = await loadOccupiedSlots(await getSql(), profile.id);
      }
      /** Only an actual inbound call gets the Connector — a staff Kassa preview stays Tafel-only. */
      if (inbound) {
        try {
          const { praxissoftwareRuntime } =
            await import("@/lib/practice/praxissoftware-runtime");
          const adapter = await praxissoftwareRuntime(profile.id, profile.pms);
          connectorAdapter = adapter;
          const spoken = `${prior} ${last}`.trim();
          const extra = await connectorPatientsFor(adapter, spoken);
          if (extra.length) {
            const { pickPracticeKb } =
              await import("@/lib/practice/practice-kb");
            kb = pickPracticeKb([...extra, ...kb], []);
          }
          connectorSlot = await connectorSlotFor(adapter, preferredDate);
        } catch {
          // Connector unreachable/erroring — Silvia keeps working off the Tafel. No PII logged.
          console.error(
            "[praxissoftware] connector lookup failed, staying on Tafel-Daten",
          );
        }
      }
    }
    const rawFallback = localReply(
      last,
      kb,
      data.edition,
      desk,
      includeDemo,
      training,
      facts,
      prior,
      occupied,
      connectorSlot,
      preferredDate,
    );
    const spokenNames = `${prior} ${last}`.trim();
    const foundPatient = Boolean(
      lookupPatient(spokenNames, kb, { includeDemo }),
    );
    /** Datenabgleich (identify.ts) aus dem ganzen bisherigen Gespräch — Grundlage für buildSystem(). */
    const identResult = identifyCaller(
      data.messages,
      patientsForIdent(kb, includeDemo),
    );
    const namedFallback = notesEmptyDeskAction(
      fillActionNames(rawFallback.action, spokenNames, { includeDemo }),
      last,
      desk,
      facts,
      foundPatient,
    );
    const alignedFallback = alignSpokenDeskTicket(
      rawFallback.text,
      namedFallback,
      last,
    );
    let fallback = {
      text: alignedFallback.text,
      action: alignedFallback.action,
    };
    if (fallback.action.type === "book" && preference?.kind === "unclear") {
      fallback = {
        text: "Für welchen Tag wünschen Sie den Termin?",
        action: {
          ...fallback.action,
          type: "none",
          kind: "Termin",
          summary: "Tag ungeklärt",
          preferredDate: undefined,
        },
      };
    } else if (fallback.action.type === "book" && preferredDate) {
      fallback = {
        ...fallback,
        action: { ...fallback.action, preferredDate },
      };
    }
    const llm = resolveLlm();
    const reply = (
      source: LlmReplySource,
      text: string,
      action: typeof fallback.action,
      provider: LlmProviderId = llm.id,
    ) => {
      if (source === "local" && last.trim()) {
        void logIfWeakReply(text, last, identResult.identified);
      }
      return {
        ok: true as const,
        text,
        action,
        source,
        provider,
      };
    };
    /** Tafel rule — label Lokal, not „Modell hat nicht geantwortet“. */
    const deskReply = (text: string, action: typeof fallback.action) =>
      reply("local", text, action, "local");
    if (!training && !data.demo && !inbound && profile && data.confirmId && isShortBookingConfirmation(last)) {
      if (!storedConfirmation) {
        return deskReply("Welchen Termin möchten Sie bestätigen?", { ...fallback.action, type: "none", preferredDate: undefined });
      }
      const storedStart = new Date(storedConfirmation.start_at);
      const storedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(storedStart);
      return deskReply(
        `Der Termin für ${storedConfirmation.pet} bleibt am ${formatSlot(storedStart)} bestehen.`,
        { ...fallback.action, type: "book", owner: storedConfirmation.owner_name, pet: storedConfirmation.pet, preferredDate: storedDate },
      );
    }
    if (!training && !data.demo && !inbound && profile && data.confirmId && storedConfirmation && isConfirmedAppointmentCorrection(last)) {
      return deskReply(
        `Der bestehende Termin für ${storedConfirmation.pet} bleibt am ${formatSlot(new Date(storedConfirmation.start_at))} bestehen. Eine Änderung trägt die Tierarzthelferin auf der Tafel ein; ich lege keinen zweiten Termin an.`,
        { ...fallback.action, type: "none", kind: "Verschieben", owner: storedConfirmation.owner_name, pet: storedConfirmation.pet, preferredDate: undefined },
      );
    }
    // Eine konkrete Uhrzeit ist nur ein Wunsch: Silvia darf sie niemals selbst buchen.
    // Als eigener Tafel-Hinweis bleibt er für die Tierarzthelferin sichtbar.
    if (!training && rawFallback.action.type === "book" && preference?.kind === "dateTime") {
      const dateLabel = new Intl.DateTimeFormat("de-AT", {
        timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric",
      }).format(new Date(`${preference.date}T12:00:00.000Z`));
      return deskReply(
        `Sie wünschen ${dateLabel} um ${preference.time} Uhr. Diese genaue Uhrzeit buche ich nicht automatisch. Die Tierarzthelferin prüft den Wunsch und meldet sich bei Ihnen.`,
        {
          type: "none",
          owner: fallback.action.owner,
          pet: fallback.action.pet,
          kind: "Terminwunsch",
          concern: `${last.slice(0, 140)} (Wunsch: ${dateLabel} um ${preference.time} Uhr)`,
          summary: `Uhrzeitwunsch ${dateLabel} um ${preference.time} Uhr – von Tierarzthelferin prüfen`,
          species: fallback.action.species,
          chip: fallback.action.chip,
          akteNote: fallback.action.akteNote,
          preferredDate: undefined,
        },
      );
    }
    if (preference?.kind === "unclear" && rawFallback.action.type === "book") {
      return deskReply(
        "Für welchen Tag wünschen Sie den Termin?",
        { ...fallback.action, type: "none", preferredDate: undefined },
      );
    }
    if (
      preferredDate &&
      !connectorSlot &&
      rawFallback.action.type === "book" &&
      !nextLocalRequestedSlot(desk.hours, occupied, preferredDate)
    ) {
      // Warteliste statt Sackgasse: der gewuenschte Tag ist ausgebucht. Silvia
      // vermerkt die Anruferin auf der Tafel-Warteliste (board.ts legt den
      // Datensatz an) und bietet zugleich einen anderen Tag an.
      const dateLabel = new Intl.DateTimeFormat("de-AT", {
        timeZone: "Europe/Vienna",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(`${preferredDate}T12:00:00.000Z`));
      return deskReply(
        `Für den ${dateLabel} ist leider kein Termin frei. Ich setze Sie auf die Warteliste — die Praxis meldet sich, sobald ein Termin frei wird. Möchten Sie trotzdem einen anderen Tag?`,
        {
          ...fallback.action,
          type: "none",
          kind: "Warteliste",
          summary: `Warteliste für ${dateLabel}`,
          preferredDate,
        },
      );
    }
    /**
     * AP 7d Teil 2 — Connector-Buchung (booking.ts), eigener Pfad, klar abgegrenzt von der
     * Bestandslogik oben. Nur bei einem echten Anruf (`inbound`), beiden expliziten Buchungsfreigaben
     * UND `capabilities.write.appointment=true`; sonst unveraendertes Verhalten (Tafel-Vormerkung
     * weiter unten/in board.ts). `null` von advanceBooking() heisst: alter Pfad, kein Override.
     */
    if (
      inbound &&
      connectorAdapter &&
      data.callId &&
      fallback.action.type === "book"
    ) {
      const caps = await connectorAdapter.capabilities();
      const { bookingEnabled } = await import("./booking");
      if (bookingEnabled(caps.ok ? caps.data : null)) {
        const { advanceBooking } = await import("./booking");
        let booking;
        try {
          booking = await advanceBooking({
            // Punkt 1: der Zustand gilt je Ordination, nicht nur je Anrufkennung.
            scope: inbound.id,
            callId: data.callId,
            adapter: connectorAdapter,
            message: last,
            owner:
              fallback.action.owner !== "Klientel"
                ? fallback.action.owner
                : undefined,
            pet:
              fallback.action.pet !== "Patient" ? fallback.action.pet : undefined,
            phone: guessPhone(`${prior} ${last}`),
            // Punkt 10: eine erkannte Chipnummer fließt in die Tier-Zuordnung.
            chip: fallback.action.chip || undefined,
            requestedDate: preferredDate,
            // Punkt 13: unklare Ausgaenge werden in der Tafel-Datenbank
            // gesichert und ueberstehen so einen Neustart.
            guard: await bookingGuard(),
          });
        } catch {
          return deskReply(
            "Die Buchung konnte nicht bestätigt werden – bitte prüfen Sie die Tafel, bevor erneut gebucht wird.",
            localActionAfterBookingFailure(fallback.action, "", true),
          );
        }
        if (booking) {
          if (booking.pending) {
            return deskReply(booking.text, localActionWhileBookingPending(fallback.action));
          }
          if (booking.failed) {
            return deskReply(booking.text, localActionAfterBookingFailure(fallback.action, booking.actionPatch.connectorStart, booking.uncertain));
          }
          return deskReply(booking.text, {
            ...fallback.action,
            ...booking.actionPatch,
          });
        }
      }
    }
    const { takeToken } = await import("@/lib/practice/rate-limit");
    const { clientIp } = await import("@/lib/practice/session.server");
    if (!takeToken(`ai:chat:${clientIp()}`, 40, 60_000).allowed) {
      return reply("local", fallback.text, fallback.action);
    }
    if (!training && isKassaTransferTurn("", last)) {
      return deskReply(fallback.text, fallback.action);
    }
    if (callbackSkipsLlm({ message: last, train: training })) {
      return deskReply(fallback.text, fallback.action);
    }
    if (contactFollowUpSkipsLlm({ message: last, train: training })) {
      return deskReply(fallback.text, fallback.action);
    }
    if (!training && isHoursTurn(last)) {
      return deskReply(fallback.text, fallback.action);
    }
    if (travelSkipsLlm({ message: last, train: training })) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      !training &&
      (isAddressAsk(last) ||
        isContactAsk(last) ||
        isInboxAsk(last) ||
        isOwnerAsk(last) ||
        isPracticeAsk(last))
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (!training && isPriceAsk(last)) {
      return deskReply(priceReply(desk), {
        ...fallback.action,
        kind: "Preisfrage",
      });
    }
    if (
      !training &&
      (rawFallback.action.kind === "Hundeabgabe" ||
        rawFallback.action.kind === "Reise / EU-Ausweis")
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      !training &&
      (fallback.action.type === "emergency" || isNachtdienstTurn(last))
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (holidaySkipsLlm({ message: last, train: training })) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      notesLiveSkipsLlm({
        message: last,
        isDemo: desk.isDemo,
        train: training,
        notes: desk.notes,
        facts,
        hasPatient: foundPatient,
      })
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      learnedFactsSkipsLlm({
        message: last,
        train: training,
        facts,
        notes: desk.notes,
      })
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      leftoverSkipsLlm({
        message: last,
        isDemo: desk.isDemo,
        train: training,
      })
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    if (
      bookSkipsLlm({ message: last, isDemo: desk.isDemo, train: training })
    ) {
      return deskReply(fallback.text, fallback.action);
    }
    try {
      const { llmChat } = await import("./llm-runtime");
      const raw = await llmChat([
        {
          role: "system",
          content: buildSystem(data.edition, kb, desk, includeDemo, {
            facts,
            train: training,
            occupied,
            thirdParty: llm.thirdParty,
            connectorSlot,
            identified: identResult.identified,
            identifiedOwner: identResult.owner,
            behavior: profile?.behavior,
          }),
        },
        ...data.messages,
      ], process.env, training ? { maxTokens: 120 } : undefined);
      if (!raw) {
        return reply("local", fallback.text, fallback.action);
      }
      const parsed = parseSilviaReply(raw, last, { includeDemo });
      parsed.action = notesEmptyDeskAction(
        fillActionNames(parsed.action, spokenNames, { includeDemo }),
        last,
        desk,
        facts,
        foundPatient,
      );
      const aligned = alignSpokenDeskTicket(parsed.text, parsed.action, last);
      parsed.text = aligned.text;
      parsed.action = aligned.action;
      if (callbackSkipsLlm({ message: last, train: training })) {
        return deskReply(parsed.text, parsed.action);
      }
      if (contactFollowUpSkipsLlm({ message: last, train: training })) {
        return deskReply(parsed.text, parsed.action);
      }
      if (training) {
        const fact = extractTrainFact(last) || last.slice(0, 240);
        parsed.action = {
          ...parsed.action,
          type: "train",
          kind: "Schulung",
          fact,
          summary: fact,
        };
      } else if (rawFallback.action.type === "emergency") {
        parsed.action = {
          ...parsed.action,
          type: "emergency",
          kind: "Notfall",
        };
        parsed.text = emergencySpoken(desk);
      } else if (isNachtdienstTurn(last)) {
        parsed.text = nachtdienstReply(desk);
      } else if (travelSkipsLlm({ message: last, train: training })) {
        parsed.text = travelReply(desk);
        parsed.action = {
          ...parsed.action,
          type: "none",
          kind: "Info",
          pet: "Patient",
          summary: travelReply(desk).slice(0, 220),
        };
        return deskReply(parsed.text, parsed.action);
      } else if (!desk.isDemo && isAddressAsk(last)) {
        parsed.text = addressReply(desk);
      } else if (!desk.isDemo && isContactAsk(last)) {
        parsed.text = contactReply(desk, last);
      } else if (!desk.isDemo && isInboxAsk(last)) {
        parsed.text = inboxReply(desk);
      } else if (!desk.isDemo && isOwnerAsk(last)) {
        parsed.text = ownerReply(desk);
      } else if (!desk.isDemo && isPracticeAsk(last)) {
        parsed.text = practiceReply(desk);
      } else if (isHoursTurn(last)) {
        parsed.text = hoursReply(desk.hours);
      } else if (holidaySkipsLlm({ message: last, train: training })) {
        parsed.text = holidayReply(desk);
        parsed.action = {
          ...parsed.action,
          type: "none",
          kind: "Info",
          pet: "Patient",
          summary: holidayReply(desk).slice(0, 220),
        };
        return deskReply(parsed.text, parsed.action);
      } else if (
        leftoverSkipsLlm({
          message: last,
          isDemo: desk.isDemo,
          train: training,
        })
      ) {
        parsed.text = leftoverReply();
        parsed.action = {
          ...parsed.action,
          type: "none",
          kind: "Info",
          pet: "Patient",
          summary: leftoverReply().slice(0, 220),
        };
        return deskReply(parsed.text, parsed.action);
      } else {
        const learned = replyFromLearnedFacts(
          last,
          learnedFactsFrom(facts, desk.notes),
        );
        if (learned) {
          parsed.text = learned;
          parsed.action = {
            ...fallback.action,
            type: "none",
            kind: "Info",
            pet: "Patient",
            summary: learned.slice(0, 220),
          };
          return deskReply(parsed.text, parsed.action);
        }
        const found = lookupPatient(`${prior} ${last}`.trim(), kb, {
          includeDemo: false,
        });
        const notesLive = notesLiveReply(last, desk, facts, Boolean(found));
        if (notesLive) {
          parsed.text = notesLive;
          parsed.action = {
            ...fallback.action,
            type: "none",
            kind: "Info",
            pet: "Patient",
            summary: notesLive.slice(0, 220),
          };
          return deskReply(parsed.text, parsed.action);
        }
      }
      if (
        liveInfoOverwriteIsLocal({
          message: last,
          isDemo: desk.isDemo,
          train: training,
          actionType: rawFallback.action.type,
        })
      ) {
        return deskReply(parsed.text, parsed.action);
      }
      return reply("alma", parsed.text, parsed.action);
    } catch {
      // Nicht still: ein Fehler im LLM-Pfad darf nicht spurlos zum lokalen
      // Fallback führen — er würde eine echte Störung verdecken. Kein PII loggen.
      console.error("[ask-alma] LLM-Pfad fehlgeschlagen, lokaler Fallback");
      return reply("local", fallback.text, fallback.action);
    }
  });
