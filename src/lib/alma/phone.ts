import { displayOwner, guessOwner } from "./actions.ts";

/** Normalize an Austrian (or E.164) phone number for wa.me / sms:. */
export function toWaMeNumber(raw: string) {
  let n = raw.replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = `43${n.slice(1)}`;
  return n;
}

export function telHref(phone: string) {
  const n = toWaMeNumber(phone);
  return n ? `tel:+${n}` : "";
}

/** First value that normalizes to a dialable number. */
export function firstPhone(...raw: Array<string | undefined | null>) {
  for (const value of raw) {
    if (value && toWaMeNumber(value)) return value;
  }
  return "";
}

/** Austrian Handy (06…) after +43 — Festnetz 01/0316 is not WhatsApp. */
export function isAtHandy(raw?: string | null) {
  const n = toWaMeNumber(String(raw ?? ""));
  return n.startsWith("436") && n.length >= 10 && n.length <= 13;
}

/** Dialable AT Handy or Festnetz. Never invent a clinic number. */
export function isAtPhone(raw?: string | null) {
  const n = toWaMeNumber(String(raw ?? ""));
  return n.startsWith("43") && n.length >= 10 && n.length <= 13;
}

export function firstHandy(...raw: Array<string | undefined | null>) {
  for (const value of raw) {
    if (value && isAtHandy(value)) return value;
  }
  return "";
}

/** Signup WhatsApp: explicit Handy wins; otherwise copy the Leitung only if it is 06…. */
export function signupWhatsapp(phone: string, whatsapp?: string) {
  const direct = String(whatsapp ?? "").trim().slice(0, 32);
  if (isAtHandy(direct)) return direct;
  const line = String(phone ?? "").trim().slice(0, 32);
  return isAtHandy(line) ? line : "";
}

/** Legacy fallback: explicit Frau-Doktor address wins, otherwise Anmelden. Register uses parsePracticeInbox. */
export function signupInbox(loginEmail: string, inbox?: string) {
  const extra = sanitizeHalterinEmail(inbox);
  if (extra) return extra;
  return sanitizeHalterinEmail(loginEmail);
}

/** True when intern mailto would still hit the login address. */
export function internInboxSameAsLogin(inbox?: string | null, login?: string | null) {
  const a = sanitizeHalterinEmail(inbox);
  const b = sanitizeHalterinEmail(login);
  return Boolean(a && b && a === b);
}

/** Intern mailto: Frau-Doktor inbox only. Empty or Anmelden stay empty — never the Kassa-Login. */
export function internPracticeInbox(inbox?: string | null, login?: string | null) {
  const parsed = parsePracticeInbox(String(inbox ?? ""), login);
  return parsed.ok ? parsed.value : "";
}

export function internInboxMissing(inbox?: string | null, login?: string | null) {
  return !internPracticeInbox(inbox, login);
}

export const PRACTICE_INBOX_EMPTY_ERROR = "Bitte die Inbox der Frau Doktor eintragen.";
export const PRACTICE_INBOX_INVALID_ERROR = "Bitte eine gültige E-Mail.";
export const PRACTICE_INBOX_SAME_LOGIN_ERROR = "Bitte eine andere Adresse als Anmelden.";

/** Heute, Einstellungen and signup: intern mailto inbox, not the Halterin and not Anmelden. */
export function parsePracticeInbox(raw: string, loginEmail?: string | null) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false as const, error: PRACTICE_INBOX_EMPTY_ERROR };
  const value = sanitizeHalterinEmail(trimmed);
  if (!value) return { ok: false as const, error: PRACTICE_INBOX_INVALID_ERROR };
  const login = sanitizeHalterinEmail(loginEmail);
  if (login && value === login) return { ok: false as const, error: PRACTICE_INBOX_SAME_LOGIN_ERROR };
  return { ok: true as const, value };
}

/** Speichern: empty `#email` keeps the hinterlegte Inbox; both empty fail. Never Anmelden. */
export function parseKeptInbox(
  raw: unknown,
  existing: string,
  loginEmail?: string | null,
): { ok: true; value: string } | { ok: false; error: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) return parsePracticeInbox(existing, loginEmail);
  return parsePracticeInbox(typed, loginEmail);
}

export function internWhatsappMissing(whatsapp?: string | null, phone?: string | null) {
  return !firstHandy(whatsapp, phone);
}

export const PRACTICE_WHATSAPP_EMPTY_ERROR = "Bitte das Handy der Frau Doktor eintragen.";
export const PRACTICE_WHATSAPP_FESTNETZ_ERROR = "WhatsApp braucht ein Handy (06…), kein Festnetz.";

/** Heute / Einstellungen: intern WhatsApp only on 06… — never copy Festnetz. */
export function parsePracticeWhatsapp(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim().slice(0, 32);
  if (!value) return { ok: false, error: PRACTICE_WHATSAPP_EMPTY_ERROR };
  if (!isAtHandy(value)) return { ok: false, error: PRACTICE_WHATSAPP_FESTNETZ_ERROR };
  return { ok: true, value };
}

/** Speichern: empty `#whatsapp` keeps the hinterlegte Handy; both empty stay empty. Never Festnetz / Huber. */
export function parseKeptWhatsapp(
  raw: unknown,
  existing: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) {
    const kept = String(existing ?? "").trim();
    if (!kept) return { ok: true, value: "" };
    const parsed = parsePracticeWhatsapp(kept);
    return parsed.ok ? parsed : { ok: true, value: "" };
  }
  return parsePracticeWhatsapp(typed);
}

export const NACHTDIENST_PHONE_EMPTY_ERROR = "Bitte die Nachtdienst-Nummer eintragen.";
export const NACHTDIENST_PHONE_INVALID_ERROR = "Bitte eine österreichische Nummer (0… oder +43).";

/** Signup, Heute, Einstellungen: Nachtdienst is Handy or Festnetz. Empty stays empty — never Vetmeduni. */
export function parsePracticeNachtdienst(input: {
  phone?: string;
  name?: string;
}): { ok: true; phone: string; name: string } | { ok: false; error: string } {
  const phone = String(input.phone ?? "").trim().slice(0, 32);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!phone) return { ok: false, error: NACHTDIENST_PHONE_EMPTY_ERROR };
  if (!isAtPhone(phone)) return { ok: false, error: NACHTDIENST_PHONE_INVALID_ERROR };
  return { ok: true, phone, name };
}

/** Speichern: empty phone keeps the hinterlegte Nummer; typed invalid fails. Never Vetmeduni. */
export function parseKeptNachtdienstPhone(
  raw: unknown,
  existing: string,
): { ok: true; phone: string } | { ok: false; error: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) {
    const kept = parsePracticeNachtdienst({ phone: existing });
    if (kept.ok) return { ok: true, phone: kept.phone };
    return { ok: false, error: NACHTDIENST_PHONE_EMPTY_ERROR };
  }
  const parsed = parsePracticeNachtdienst({ phone: typed });
  if (!parsed.ok) return parsed;
  return { ok: true, phone: parsed.phone };
}

export const PRACTICE_PHONE_EMPTY_ERROR = "Bitte die Leitungsnummer eintragen.";
export const PRACTICE_PHONE_INVALID_ERROR = "Bitte eine österreichische Nummer (0… oder +43).";

/** Heute and signup: Ordinations-Leitung is Handy or Festnetz. Empty stays empty — never Huber Josefstadt. */
export function parsePracticePhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim().slice(0, 32);
  if (!value) return { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR };
  if (!isAtPhone(value)) return { ok: false, error: PRACTICE_PHONE_INVALID_ERROR };
  return { ok: true, value };
}

/** Leftover Huber demo Leitung is not hinterlegt. */
export function isHuberDemoLine(raw?: string | null) {
  return toWaMeNumber(String(raw ?? "")) === "4314051288";
}

/** Speichern: empty `#phone` keeps the hinterlegte Leitung; both empty fail. Never keep Huber 01 405 12 88. */
export function parseKeptPhone(
  raw: unknown,
  existing: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) {
    const kept = parsePracticePhone(existing);
    if (kept.ok && !isHuberDemoLine(kept.value)) return kept;
    return { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR };
  }
  return parsePracticePhone(typed);
}

/** Intern protocol → Frau Doktor. Klientel-thread → Halterin only, never the practice line. */
export function threadDraftDest(input: {
  intern: boolean;
  ownerPhone?: string;
  practiceWhatsapp?: string;
  practicePhone?: string;
}) {
  if (input.intern) {
    return {
      phone: firstPhone(input.practiceWhatsapp, input.practicePhone),
      whatsapp: firstHandy(input.practiceWhatsapp, input.practicePhone),
      kind: "intern" as const,
    };
  }
  const phone = firstPhone(input.ownerPhone);
  return {
    phone,
    whatsapp: firstHandy(phone),
    kind: "halterin" as const,
  };
}

/** Austrian Handy (06…) or Festnetz (01 Wien, 0316 Graz, …) from a spoken sentence. Skips 15-digit chips. */
export function guessPhone(raw: string) {
  const text = String(raw ?? "");
  const patterns = [
    /(?:\+|00)\s*43[\s/-]*[1-9][\d\s/-]{7,13}/g,
    /\b0[1-9](?:[\s/-]*\d){7,12}\b/g,
  ];
  const found: string[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 13) continue;
      found.push(m[0].replace(/[\s/-]/g, "").slice(0, 24));
    }
  }
  return found.find((n) => isAtHandy(n)) || found[0] || "";
}

const BOOKING_TURN =
  /termin|slot|impf|notfall|lahm|kastration|kontrolle|reise|chip|ausweis|katze|hund|hündin/i;

/** True when this turn is only giving a Handy, not a new booking. */
export function isPhoneFollowUp(message: string) {
  if (!guessPhone(message)) return false;
  return !BOOKING_TURN.test(message);
}

/** Spoken Halterin address. Never the practice inbox unless she said that address. */
export function guessEmail(raw: string) {
  const m = String(raw ?? "").match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return sanitizeHalterinEmail(m?.[0] ?? "");
}

/** True when this turn is only giving an E-Mail, not a new booking. */
export function isEmailFollowUp(message: string) {
  if (!guessEmail(message)) return false;
  return !BOOKING_TURN.test(message);
}

/** True when this turn is only giving the Halterin name. */
export function isNameFollowUp(message: string, opts?: { includeDemo?: boolean }) {
  if (BOOKING_TURN.test(message)) return false;
  return guessOwner(message, opts) !== "Klientel";
}

const REJECTED_CALLBACK_REQUEST =
  /\bbitte\s+keinen?\s+rückruf\b|\bich\s+(?:möchte|will)\s+keinen?\s+rückruf\b|\brückruf\s+(?:bitte\s+)?nicht\b/i;

const REJECTED_APPOINTMENT_REQUEST =
  /\b(?:bitte\s+)?keinen?\s+(?:termin|slot)\s+(?:buchen|vereinbaren|legen|eintragen)\b|\bich\s+(?:möchte|will)\s+keinen?\s+(?:termin|slot)\b|\b(?:termin|slot)\s+(?:bitte\s+)?nicht\s+(?:buchen|vereinbaren|legen|eintragen)\b/i;

/** True when the caller asked the desk to ring them back. */
export function isCallbackTurn(kind: string, message: string) {
  if (REJECTED_CALLBACK_REQUEST.test(message)) {
    return false;
  }
  if (/rückruf/i.test(kind)) return true;
  return /zurückruf|rufen sie mich|rufen sie uns|callback/i.test(message);
}

/** True when the caller asked for a slot, not only a Rückrufzettel. */
export function wantsAppointment(message: string) {
  if (REJECTED_APPOINTMENT_REQUEST.test(message)) {
    return false;
  }
  return /\btermin\b|\bslot\b|impfung|kastration/i.test(message);
}

/** Live Rückrufzettel is a Tafel rule — skip the model. Schulung and a real Termin stay. */
export function callbackSkipsLlm(input: { message: string; train?: boolean }) {
  if (input.train) return false;
  if (wantsAppointment(input.message)) return false;
  return isCallbackTurn("", input.message);
}

/** Live Termin/Impfung uses the Tafel next slot — skip the model. Demo and Schulung stay. */
export function bookSkipsLlm(input: { message: string; isDemo?: boolean; train?: boolean }) {
  if (input.train || input.isDemo) return false;
  const t = String(input.message ?? "");
  if (!wantsAppointment(t)) return false;
  return !/was kostet|welche tiere|nehmt ihr|preise?|tarif/i.test(t);
}

/**
 * A Rückrufbitte must not lay a Termin — even when the model tagged type=book
 * because it said „Ich lege einen Rückrufzettel“.
 */
export function booksDeskSlot(action: { type: string; kind?: string }, message: string) {
  if (action.type !== "book") return false;
  if (REJECTED_APPOINTMENT_REQUEST.test(message)) return false;
  if (isCallbackTurn(action.kind ?? "", message) && !wantsAppointment(message)) return false;
  if (isKassaTransferTurn(action.kind ?? "", message) && !wantsAppointment(message)) return false;
  return true;
}

/** Anrufe label. Kind Termin must not become „Termin Termin gelegt“. */
export function bookedCallAction(kind?: string) {
  const k = String(kind ?? "").trim();
  if (!k || /^termin$/i.test(k)) return "Termin gelegt";
  return `Termin ${k} gelegt`;
}

/** Tafel label. Old persist rows may still say „Termin Termin gelegt“. */
export function displayCallAction(action?: string) {
  const raw = String(action ?? "").trim();
  if (/^termin(\s+termin)+\s+gelegt$/i.test(raw)) return "Termin gelegt";
  return raw;
}

export function coerceDeskTicketAction<T extends { type: string; kind: string; summary?: string }>(
  action: T,
  message: string,
): T {
  if (action.type === "emergency" || action.type === "train") return action;
  if (action.type === "book" && REJECTED_APPOINTMENT_REQUEST.test(message)) {
    const callback = isCallbackTurn("", message);
    return {
      ...action,
      type: "none",
      kind: callback ? "Rückruf" : "Info",
      summary: callback ? action.summary || "Rückrufbitte" : "Keine Buchung gewünscht",
    };
  }
  if (isCallbackTurn(action.kind, message) && !wantsAppointment(message)) {
    return { ...action, type: "none", kind: "Rückruf", summary: action.summary || "Rückrufbitte" };
  }
  if (isKassaTransferTurn(action.kind, message) && !wantsAppointment(message)) {
    return { ...action, type: "none", kind: "Kassa", summary: action.summary || KASSA_HANDOVER_SUMMARY };
  }
  return action;
}

const CALLBACK_BASE =
  "Ich lege einen Rückrufzettel für die Tierarzthelferin. Jemand ruft Sie zurück, sobald frei ist.";

/** Both Halterin and Tier were named. Nameless Rückruf uses callbackSpoken(). */
export const CALLBACK_SPOKEN = `${CALLBACK_BASE} Name und Tier habe ich notiert.`;

function petWasNamed(pet?: string | null) {
  const p = String(pet ?? "").trim();
  return Boolean(p) && !/^patient$/i.test(p) && !/^hund$/i.test(p) && !/^protokoll$/i.test(p);
}

function ownerWasNamed(owner?: string | null) {
  const who = displayOwner(String(owner ?? ""));
  return Boolean(who && who !== "Klientel");
}

/** Spoken Rückruf copy must match intern: no „Tier notiert“ when the body says nicht genannt. */
export function callbackSpoken(action: { pet?: string | null; owner?: string | null } = {}) {
  const namedPet = petWasNamed(action.pet);
  const namedOwner = ownerWasNamed(action.owner);
  if (namedPet && namedOwner) return CALLBACK_SPOKEN;
  if (namedOwner) return `${CALLBACK_BASE} Ihren Namen habe ich notiert.`;
  if (namedPet) return `${CALLBACK_BASE} Das Tier habe ich notiert.`;
  return CALLBACK_BASE;
}

export const KASSA_SPOKEN =
  "Ich verbinde Sie mit der Tierarzthelferin. Einen Moment, bleiben Sie in der Leitung.";
export const KASSA_HANDOVER_ACTION = "An die Tierarzthelferin";
export const KASSA_HANDOVER_SUMMARY = "An die Tierarzthelferin übergeben";

/** True when Silvia claimed a slot in speech — not a Rückrufzettel / Übergabe. */
export function looksLikeBookedSlotSpeech(text: string) {
  const t = String(text ?? "");
  if (/rückrufzettel/i.test(t) || /verbinde sie mit der (kassa|tierarzthelferin)/i.test(t)) return false;
  return (
    /\b\d{1,2}[:.]\d{2}\b/.test(t) ||
    /\btermin (liegt|gelegt|eintragen)\b/i.test(t) ||
    /\b(ich (hätte|setze|lege)|nächsten offenen slot)\b/i.test(t)
  );
}

/** Keep spoken copy on the same ticket persist writes — no „15:00 liegt“ and no invented Tier. */
export function alignSpokenDeskTicket<
  T extends { type: string; kind: string; summary?: string; pet?: string; owner?: string },
>(text: string, action: T, message: string): { text: string; action: T } {
  const next = coerceDeskTicketAction(action, message);
  if (
    action.type === "book" &&
    next.type === "none" &&
    next.kind === "Info" &&
    REJECTED_APPOINTMENT_REQUEST.test(message)
  ) {
    return {
      text: "Ich buche keinen Termin. Wobei kann ich Ihnen sonst helfen?",
      action: next,
    };
  }
  if (wantsAppointment(message)) return { text, action: next };
  if (isCallbackTurn(next.kind, message)) {
    return { text: callbackSpoken(next), action: next };
  }
  if (isKassaTransferTurn(next.kind, message)) {
    return { text: KASSA_SPOKEN, action: next };
  }
  return { text, action: next };
}

const KASSA_TRANSFER_RE =
  /mit (?:der |einer )?(?:kassa|tierarzthelferin)|an die (?:kassa|tierarzthelferin)|verbinden sie mich|mit jemandem sprechen|mit einem menschen|eine echte person|jemand vom personal/i;

/** True when the caller asked to be handed to a human at the desk. */
export function isKassaTransferTurn(kind: string, message: string) {
  if (/^(kassa|tierarzthelferin)$/i.test(String(kind).trim())) return true;
  return KASSA_TRANSFER_RE.test(message);
}

/** Persist contact only — do not lay a second Termin on this turn. */
export function isContactOnlyTurn(actionType: string, message: string) {
  if (actionType === "emergency") return false;
  if (isCallbackTurn("", message)) return false;
  if (isKassaTransferTurn("", message)) return false;
  return isPhoneFollowUp(message) || isNameFollowUp(message) || isEmailFollowUp(message);
}

/** Live Handy/Name/E-Mail follow-up is a Tafel rule — skip the model. Schulung and a Termin stay. */
export function contactFollowUpSkipsLlm(input: { message: string; train?: boolean }) {
  if (input.train) return false;
  if (wantsAppointment(input.message)) return false;
  return isContactOnlyTurn("none", input.message);
}

export function isHandyOnlyTurn(actionType: string, message: string) {
  return isContactOnlyTurn(actionType, message);
}

/** What the Tierarzthelferin can actually open from this number. Festnetz is SMS/mailto, never wa.me. */
export function deskConfirmChannelCopy(phone?: string | null) {
  if (isAtHandy(phone)) {
    return "Die Tierarzthelferin öffnet SMS, WhatsApp oder E-Mail, Silvia sendet nicht selbst.";
  }
  if (toWaMeNumber(String(phone ?? ""))) {
    return "Die Tierarzthelferin öffnet SMS oder E-Mail. WhatsApp braucht ein Handy, nicht die Festnetznummer. Silvia sendet nicht selbst.";
  }
  return "Die Tierarzthelferin öffnet SMS, WhatsApp oder E-Mail, Silvia sendet nicht selbst.";
}

export function withContactAsk(bookText: string, spoken: string, opts?: { includeDemo?: boolean }) {
  const handy = guessPhone(spoken);
  const mail = guessEmail(spoken);
  const owner = guessOwner(spoken, opts);
  const named = owner !== "Klientel";
  const label = named ? owner.replace(/^Klientel\s+/i, "") : "";
  const dest = [label, handy, mail].filter(Boolean).join(", ");
  if (handy && named) {
    return `${bookText} Die Bestätigung geht an ${dest}. ${deskConfirmChannelCopy(handy)}`;
  }
  if (handy) {
    return `${bookText} Die Bestätigung geht an ${dest}. Wie heißt die Halterin?`;
  }
  if (mail && named) {
    return `${bookText} Die E-Mail ${mail} liegt. Auf welche Nummer soll die SMS, ${label}? Handy für WhatsApp, Festnetz für SMS.`;
  }
  if (mail) {
    return `${bookText} Die E-Mail ${mail} liegt. Wie heißen Sie, und auf welche Nummer soll die SMS? Handy für WhatsApp, Festnetz für SMS.`;
  }
  if (named) {
    return `${bookText} Auf welche Nummer soll die Bestätigung, ${label}? Handy für WhatsApp, Festnetz für SMS. Eine E-Mail darf sie auch nennen.`;
  }
  return `${bookText} Wie heißen Sie, und auf welche Nummer soll die Bestätigung? Handy für WhatsApp, Festnetz für SMS. Eine E-Mail darf sie auch nennen.`;
}

export function withHandyAsk(bookText: string, spoken: string, opts?: { includeDemo?: boolean }) {
  return withContactAsk(bookText, spoken, opts);
}

export function waMeHref(phone: string, body: string) {
  const n = toWaMeNumber(phone);
  if (!n) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(body)}`;
}

/** WhatsApp draft to the Halterin Handy only. Festnetz stays on SMS/tel. Never the practice line. */
export function halterinDraftHref(phone: string | undefined | null, body: string) {
  return isAtHandy(phone) ? waMeHref(String(phone), body) : "";
}

/** SMS composer to the Halterin only. Never falls back to the practice line. No gateway. */
export function halterinSmsHref(phone: string | undefined | null, body: string) {
  return phone ? smsHref(phone, body) : "";
}

/** Opens the device SMS composer. Silvia has no SMS gateway — this is the same idea as mailto. */
export function smsHref(phone: string, body: string) {
  const n = toWaMeNumber(phone);
  if (!n) return "";
  return `sms:+${n}?body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string, subject: string, body: string) {
  const to = email.trim();
  if (!to || !to.includes("@")) return "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Mail composer for the Halterin. With an address it pre-fills To:; without one it still
 * opens a draft (mailto:?) so the Kassa can type the address. Never uses the practice inbox.
 */
export function sanitizeHalterinEmail(raw?: string | null) {
  const to = String(raw ?? "").trim().toLowerCase().slice(0, 120);
  if (!to || /\s/.test(to) || !to.includes("@")) return "";
  const at = to.indexOf("@");
  const local = to.slice(0, at);
  const domain = to.slice(at + 1);
  if (!local || !domain.includes(".")) return "";
  return to;
}

export function halterinMailHref(subject: string, body: string, email?: string | null) {
  const q = `subject=${encodeURIComponent(String(subject).slice(0, 120))}&body=${encodeURIComponent(body)}`;
  const to = sanitizeHalterinEmail(email);
  if (to) return `mailto:${to}?${q}`;
  return `mailto:?${q}`;
}
