import { displayOwner } from "../alma/actions.ts";
import { isPlaceholderPet } from "../alma/protocol.ts";
import { mailtoHref, smsHref, telHref, threadDraftDest, waMeHref } from "../alma/phone.ts";

/** Heute intern card title: the Tier, else the Halterin from the Betreff, never a bare Patient. */
export function internDeskTitle(t: { pet: string; name: string; preview?: string }) {
  if (!isPlaceholderPet(t.pet)) return t.pet;
  const preview = String(t.preview ?? "");
  const afterTag = preview.replace(/^(Rückruf|Termin|Kassa|Übergabe|Tierarzthelferin|Anruf|Notfall|Kontakt):\s*/i, "").trim();
  const parts = afterTag.split("·").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const who = displayOwner(part);
    if (!isPlaceholderPet(who) && who !== "Klientel") return who;
  }
  return t.name;
}

export function isOpenDeskTicket(call: { status: string; action: string }) {
  if (call.status === "erledigt") return false;
  return /rückruf/i.test(call.action) || /an die (kassa|tierarzthelferin)/i.test(call.action);
}

export function recentLogCalls<T extends { id: string; status: string; action: string }>(
  calls: T[],
  take = 5,
): T[] {
  return calls.filter((c) => !isOpenDeskTicket(c)).slice(0, take);
}

/** Leftover Auskunft / nameless Kontakt intern — hide from Heute and the badge, not Rückruf. */
export function isLeftoverInternNoise(t: { intern?: boolean; preview?: string }) {
  if (!t.intern) return false;
  const preview = String(t.preview ?? "");
  if (/rückruf|termin|kassa|notfall|übergabe/i.test(preview)) return false;
  if (/auskunft hinterlegt|auskunft liegt/i.test(preview)) return true;
  return /kontakt:\s*protokoll\s*·\s*klient/i.test(preview);
}

/** Unread intern notes for Frau Doktor — Heute, not only /app/nachrichten. */
export function unreadInternThreads<
  T extends { intern: boolean; unread: number; preview?: string },
>(threads: T[], take = 8): T[] {
  return threads
    .filter((t) => t.intern && Number(t.unread) > 0 && !isLeftoverInternNoise(t))
    .slice(0, take);
}

/** Nav / Heute chip: intern unread only, never Klientel confirmations. */
export function unreadInternCount<T extends { intern: boolean; unread: number; preview?: string }>(
  threads: T[],
) {
  return threads.reduce(
    (n, t) => n + (t.intern && !isLeftoverInternNoise(t) ? Number(t.unread) || 0 : 0),
    0,
  );
}

/** Inner intern tel/wa/sms/mailto ids — one set per thread, never a shared Heute id. */
export function internDraftDomIds(prefix: string, id?: string | null) {
  const key = String(id ?? "").trim().slice(0, 80);
  if (!key) return {};
  const root = `${String(prefix ?? "").replace(/-+$/, "")}-${key}`;
  return {
    tel: `${root}-tel`,
    wa: `${root}-wa`,
    sms: `${root}-sms`,
    mail: `${root}-mail`,
    settings: `${root}-settings`,
    gelesen: `${root}-gelesen`,
  };
}

/** After a call: missing intern mail goes to Inbox `#email`, not Leitung. */
export function internSettingsTarget(input: {
  href?: string;
  mailHref?: string;
  smsHref?: string;
}): { hash: "email" | "whatsapp" | "leitung"; label: string } | null {
  const hasWa = Boolean(input.href);
  const hasMail = Boolean(input.mailHref);
  if (hasWa && hasMail) return null;
  if (hasWa) return { hash: "email", label: "E-Mail hinterlegen" };
  if (hasMail) return { hash: "whatsapp", label: "WhatsApp-Handy hinterlegen" };
  if (input.smsHref) return { hash: "whatsapp", label: "WhatsApp-Handy hinterlegen" };
  return { hash: "leitung", label: "Nummer und E-Mail hinterlegen" };
}

/**
 * WhatsApp/mailto/sms/tel to Frau Doktor. After a Kontakt follow-up the last line is only
 * the new address — join the whole intern thread so the slot stays in the draft.
 */
export function internDraftBody(
  messages: Array<{ text?: string }> | undefined | null,
  preview = "",
) {
  const parts: string[] = [];
  for (const row of messages ?? []) {
    const text = String(row?.text ?? "").trim();
    if (!text || parts[parts.length - 1] === text) continue;
    parts.push(text);
  }
  return (parts.join("\n\n") || String(preview ?? "").trim()).slice(0, 4000);
}

export type LiveInternDraft = {
  id: string;
  pet: string;
  preview: string;
  owner: string;
  href: string;
  smsHref: string;
  mailHref: string;
  telHref: string;
};

/**
 * Staff `/sprechen` intern drafts after persist — wa.me / sms: / mailto: / tel: to the
 * Nummer/Adresse from Einstellungen, never the Halterin, never Huber defaults.
 */
export function liveLineInternDraft(input: {
  id: string;
  pet?: string;
  preview: string;
  body: string;
  ownerName: string;
  practiceWhatsapp?: string;
  practicePhone?: string;
  practiceEmail?: string;
}): LiveInternDraft | null {
  const id = String(input.id ?? "").slice(0, 80);
  if (!id) return null;
  const pet = String(input.pet ?? "").trim().slice(0, 40) || "Protokoll";
  const preview = String(input.preview ?? "").trim().slice(0, 180);
  const body = internDraftBody([{ text: input.body }], preview);
  const dest = threadDraftDest({
    intern: true,
    practiceWhatsapp: input.practiceWhatsapp,
    practicePhone: input.practicePhone,
  });
  const email = String(input.practiceEmail ?? "").trim();
  const owner = String(input.ownerName ?? "").trim().slice(0, 80) || "die Frau Doktor";
  return {
    id,
    pet,
    preview,
    owner,
    href: dest.whatsapp ? waMeHref(dest.whatsapp, body) : "",
    smsHref: dest.phone ? smsHref(dest.phone, body) : "",
    mailHref: email ? mailtoHref(email, preview || `Protokoll: ${pet}`, body) : "",
    telHref: dest.phone ? telHref(dest.phone) : "",
  };
}

/** Halterin confirmations mark read on open. Intern stays unread until WhatsApp/mailto/Gelesen. */
export function marksReadOnOpen(thread: { intern: boolean }) {
  return !thread.intern;
}

/** Open Notfälle for Heute — abgeschlossen cases stay on /app/notfall. */
export function isOpenEmergency(row: { status: string }) {
  return row.status !== "abgeschlossen";
}

export function openEmergencies<T extends { status: string }>(rows: T[], take = 6): T[] {
  return rows.filter(isOpenEmergency).slice(0, take);
}
